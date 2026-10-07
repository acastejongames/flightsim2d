import type { Sim } from './sim';
import cautionTerrainUrl from '../assets/gpws/CautionTerrain.mp3';
import pullUpUrl from '../assets/gpws/PullUp.mp3';
import terrainTerrainUrl from '../assets/gpws/TerrainTerrain.mp3';
import tooLowGearUrl from '../assets/gpws/TooLowGear.mp3';
import windshearUrl from '../assets/gpws/WINDSHEAR.mp3';
import propellerUrl from '../assets/engines/propeller.wav';
import afterburnerUrl from '../assets/engines/afterburner.wav';

/** raw voice bytes, fetched once and shared across engine restarts */
let voiceBytes: ArrayBuffer[] | null = null;
/** raw engine-loop bytes, fetched once and shared across engine restarts */
let engineBytes: ArrayBuffer[] | null = null;

export class AudioEngine {
  private ac: AudioContext | null = null;
  private master!: GainNode;
  private noiseBuf!: AudioBuffer;
  private jetGain!: GainNode;
  private jetFilter!: BiquadFilterNode;
  private roarGain!: GainNode;
  private roarFilter!: BiquadFilterNode;
  private propGain!: GainNode;
  private propFilter!: BiquadFilterNode;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private rumbleGain!: GainNode;
  private rainGain!: GainNode;
  private rainFilter!: BiquadFilterNode;
  private turbGain!: GainNode;
  private beepOsc!: OscillatorNode;
  private beepGain!: GainNode;
  private lastAlive = true;
  private lastGrounded = true;
  private lastCat = false;
  private lastArrested = false;
  private kind: 'prop' | 'jet' = 'prop';
  muted = false;

  // ---- GPWS voice callouts (mp3): one voice at a time, by alert priority
  private voiceGain!: GainNode;
  private voiceBuf = new Map<string, AudioBuffer>();
  private voicesLoading = false;
  private voicesReady = false;
  /** alert currently being served: windshear | pullup | toolowgear | caution | '' */
  private voiceId = '';
  /** AudioContext time when the playing sample ends */
  private voiceEndsAt = 0;
  /** earliest AudioContext time to (re)play the active alert */
  private voiceNextAt = 0;
  private voiceSrc: AudioBufferSourceNode | null = null;
  /** PULL UP opens with TERRAIN TERRAIN, then repeats PULL UP until clear */
  private pullUpTerrainSaid = false;

  // ---- engine loops (recorded samples, seamless): propeller / mil jet / AB
  private engBuf = new Map<string, AudioBuffer>();
  private engLoading = false;
  private engStarted = false;
  private propSrc: AudioBufferSourceNode | null = null;
  private jetSrc: AudioBufferSourceNode | null = null;
  private abSrc: AudioBufferSourceNode | null = null;

  init(kind: 'prop' | 'jet' | 'heli'): void {
    this.dispose();
    // heli reuses prop bus but with rotor timbre
    this.kind = kind === 'heli' ? 'prop' : kind;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ac = new AC();
    this.ac = ac;
    this.master = ac.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ac.destination);

    // GPWS voices ride the master bus, so mute and suspend cover them too
    this.voiceGain = ac.createGain();
    this.voiceGain.gain.value = 0.9;
    this.voiceGain.connect(this.master);
    this.voiceBuf.clear();
    this.voicesLoading = false;
    this.voicesReady = false;
    this.voiceSrc = null;
    this.voiceId = '';
    this.pullUpTerrainSaid = false;
    this.engBuf.clear();
    this.engLoading = false;
    this.engStarted = false;
    this.propSrc = null;
    this.jetSrc = null;
    this.abSrc = null;

    const len = ac.sampleRate * 2;
    this.noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    const noise = (): AudioBufferSourceNode => {
      const n = ac.createBufferSource();
      n.buffer = this.noiseBuf;
      n.loop = true;
      n.start();
      return n;
    };

    // recorded engine loops (each family loop starts once the samples decode,
    // gain at zero — update() rides the gains, never start/stop, so no clicks)
    this.propFilter = ac.createBiquadFilter();
    this.propFilter.type = 'lowpass';
    this.propFilter.frequency.value = 800;
    this.propGain = ac.createGain();
    this.propGain.gain.value = 0;
    this.propFilter.connect(this.propGain);
    this.propGain.connect(this.master);

    // mil jet: the AB recording pitched down + dulled until jet.mp3 lands
    this.jetFilter = ac.createBiquadFilter();
    this.jetFilter.type = 'lowpass';
    this.jetFilter.frequency.value = 900;
    this.jetGain = ac.createGain();
    this.jetGain.gain.value = 0;
    this.jetFilter.connect(this.jetGain);
    this.jetGain.connect(this.master);

    // afterburner roar
    this.roarFilter = ac.createBiquadFilter();
    this.roarFilter.type = 'lowpass';
    this.roarFilter.frequency.value = 2500;
    this.roarGain = ac.createGain();
    this.roarGain.gain.value = 0;
    this.roarFilter.connect(this.roarGain);
    this.roarGain.connect(this.master);

    // wind
    this.windFilter = ac.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 500;
    this.windFilter.Q.value = 0.5;
    this.windGain = ac.createGain();
    this.windGain.gain.value = 0;
    noise().connect(this.windFilter);
    this.windFilter.connect(this.windGain);
    this.windGain.connect(this.master);

    // rolling rumble
    const rf = ac.createBiquadFilter();
    rf.type = 'lowpass';
    rf.frequency.value = 140;
    this.rumbleGain = ac.createGain();
    this.rumbleGain.gain.value = 0;
    noise().connect(rf);
    rf.connect(this.rumbleGain);
    this.rumbleGain.connect(this.master);

    // rain / snow hiss
    this.rainFilter = ac.createBiquadFilter();
    this.rainFilter.type = 'bandpass';
    this.rainFilter.frequency.value = 2400;
    this.rainFilter.Q.value = 0.4;
    this.rainGain = ac.createGain();
    this.rainGain.gain.value = 0;
    noise().connect(this.rainFilter);
    this.rainFilter.connect(this.rainGain);
    this.rainGain.connect(this.master);

    // turbulent air rumble
    const tf = ac.createBiquadFilter();
    tf.type = 'lowpass';
    tf.frequency.value = 320;
    this.turbGain = ac.createGain();
    this.turbGain.gain.value = 0;
    noise().connect(tf);
    tf.connect(this.turbGain);
    this.turbGain.connect(this.master);

    // stall horn
    this.beepOsc = ac.createOscillator();
    this.beepOsc.type = 'square';
    this.beepOsc.frequency.value = 760;
    this.beepGain = ac.createGain();
    this.beepGain.gain.value = 0;
    this.beepOsc.connect(this.beepGain);
    this.beepGain.connect(this.master);
    this.beepOsc.start();
  }

  resume(): void {
    if (this.ac && this.ac.state === 'suspended') void this.ac.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.ac) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ac.currentTime, 0.05);
  }

  suspend(): void {
    if (this.ac && this.ac.state === 'running') void this.ac.suspend();
  }

  private burst(dur: number, freq: number, gain: number, type: BiquadFilterType = 'lowpass'): void {
    const ac = this.ac;
    if (!ac) return;
    const src = ac.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, ac.currentTime);
    f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.12), ac.currentTime + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(gain, ac.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.master);
    src.start(ac.currentTime, Math.random());
    src.stop(ac.currentTime + dur + 0.05);
  }

  update(sim: Sim): void {
    const ac = this.ac;
    if (!ac) return;
    const t = ac.currentTime;
    const tc = 0.08;
    const s = sim.spec;
    const th = sim.alive ? sim.thrust : 0;
    const spdN = Math.min(1, sim.tas / 250);
    const dens = Math.min(1, sim.rho / 1.225 + 0.2);

    this.ensureEngines();
    if (this.kind === 'prop') {
      // recorded prop loop: winds up in pitch and opens up with power
      if (this.propSrc) this.propSrc.playbackRate.setTargetAtTime(0.8 + th * 0.45, t, tc);
      this.propFilter.frequency.setTargetAtTime(400 + th * 1100, t, tc);
      this.propGain.gain.setTargetAtTime(sim.alive && !sim.engineOut ? 0.1 + th * 0.28 : 0, t, 0.1);
      this.jetGain.gain.setTargetAtTime(0, t, tc);
      this.roarGain.gain.setTargetAtTime(0, t, tc);
    } else {
      // recorded loops: dulled AB bed for mil, full roar crossfaded in with the blower
      const mil = Math.min(1, th / 0.85);
      const ab = Math.max(0, th - 0.85) / 0.15;
      const hasAB = s.thrustAB > 0;
      if (this.jetSrc) this.jetSrc.playbackRate.setTargetAtTime(0.62 + mil * 0.18, t, tc);
      this.jetFilter.frequency.setTargetAtTime(700 + mil * 600, t, tc);
      this.jetGain.gain.setTargetAtTime(sim.alive ? (1 - ab) * (0.06 + mil * 0.24) * dens : 0, t, 0.12);
      if (this.abSrc) this.abSrc.playbackRate.setTargetAtTime(0.94 + ab * 0.12, t, tc);
      this.roarGain.gain.setTargetAtTime(sim.alive && hasAB ? ab * 0.75 * dens : 0, t, 0.15);
      this.propGain.gain.setTargetAtTime(0, t, tc);
    }
    // weather: wind, rain and turbulent air
    const precip = Math.min(1, (sim.air?.precip ?? 0) * (sim.grounded ? 0.7 : 1));
    const turb = Math.min(1.2, sim.air?.turb ?? 0);
    const windSpeed = Math.hypot(sim.wind.head, sim.wind.cross) / 18;
    this.windFilter.frequency.setTargetAtTime(300 + spdN * 1800, t, 0.1);
    this.windGain.gain.setTargetAtTime(
      (sim.alive && !sim.grounded ? Math.pow(spdN, 1.4) * 0.35 * dens : 0) + Math.min(0.22, windSpeed * 0.09),
      t,
      0.15,
    );
    if (this.rainGain) {
      this.rainFilter.frequency.setTargetAtTime(1800 + precip * 2600, t, 0.2);
      this.rainGain.gain.setTargetAtTime(precip * 0.16, t, 0.25);
    }
    if (this.turbGain) this.turbGain.gain.setTargetAtTime(sim.alive && !sim.grounded ? Math.pow(turb, 1.6) * 0.16 : turb * 0.04, t, 0.2);
    this.rumbleGain.gain.setTargetAtTime(sim.alive && sim.grounded ? Math.min(0.35, Math.abs(sim.u) / 70) * (sim.belly ? 2 : 1) : 0, t, 0.1);
    // red warnings beep fast, the amber TERRAIN AHEAD caution beeps slower
    // and lower so the pilot can tell them apart with eyes outside — but once
    // the GPWS voices are loaded they speak instead of the terrain beeps
    const urgent = (sim.stallWarn || sim.overspeed || (sim.pullUp && !this.voicesReady)) && sim.alive;
    const caution = sim.terrainAhead && sim.alive && !sim.pullUp && !this.voicesReady;
    const beep = (urgent && Math.floor(sim.time * 5) % 2 === 0) || (caution && Math.floor(sim.time * 2.5) % 2 === 0);
    this.beepOsc.frequency.setTargetAtTime(sim.pullUp ? 980 : caution ? 660 : 760, t, 0.01);
    this.beepGain.gain.setTargetAtTime(beep ? 0.07 : 0, t, 0.01);
    this.updateVoices(sim);

    // events
    if (this.lastAlive && !sim.alive) {
      this.burst(2.6, 1400, 1.2);
      this.burst(1.2, 4000, 0.5, 'bandpass');
    }
    if (!this.lastGrounded && sim.grounded && sim.alive) {
      this.burst(0.35, 600, Math.min(1, 0.2 + sim.sinkRate * 0.12));
      if (sim.sinkRate > 0.5) this.burst(0.5, 3000, 0.12, 'highpass');
    }
    if (!this.lastCat && sim.catActive) this.burst(1.6, 2200, 0.5, 'bandpass');
    if (!this.lastArrested && sim.arrested) this.burst(1.2, 2600, 0.5, 'bandpass');
    if (sim.thunderPulse > 0.01) {
      const p = sim.thunderPulse;
      this.burst(1.6 + p * 1.4, 260 + p * 500, 0.55 * p, 'lowpass');
      this.burst(0.7 + p * 0.6, 1800 + p * 900, 0.2 * p, 'bandpass');
      sim.thunderPulse = 0;
    }
    this.lastAlive = sim.alive;
    this.lastGrounded = sim.grounded;
    this.lastCat = sim.catActive;
    this.lastArrested = sim.arrested;
  }

  /**
   * Engine loops: fetch + decode the recorded samples once (works while the
   * context is suspended), then start each family loop exactly once with its
   * gain at zero — update() rides the gains, so there is never a start/stop
   * click, and the baked loop points make every revolution seamless.
   */
  private ensureEngines(): void {
    const ac = this.ac;
    if (!ac || this.engStarted || this.engLoading) return;
    this.engLoading = true;
    const ac0 = ac;
    void (async () => {
      try {
        if (!engineBytes) {
          engineBytes = await Promise.all(
            [propellerUrl, afterburnerUrl].map(async (u) => (await fetch(u)).arrayBuffer()),
          );
        }
        const decoded = await Promise.all(engineBytes.map((b) => ac0.decodeAudioData(b.slice(0)).catch(() => null)));
        if (this.ac !== ac0) return; // restarted mid-load: the new context re-decodes
        const names = ['prop', 'ab'];
        decoded.forEach((buf, i) => {
          if (buf) this.engBuf.set(names[i], buf);
        });
        const loop = (buf: AudioBuffer | undefined, filter: BiquadFilterNode): AudioBufferSourceNode | null => {
          if (!buf) return null;
          const src = ac0.createBufferSource();
          src.buffer = buf;
          src.loop = true;
          src.loopStart = 0;
          src.loopEnd = buf.duration;
          src.connect(filter);
          src.start();
          return src;
        };
        this.propSrc = loop(this.engBuf.get('prop'), this.propFilter);
        // TODO(jet.mp3): point jetSrc at the mil-power recording when it lands;
        // until then mil jet is the AB loop pitched down and dulled
        this.jetSrc = loop(this.engBuf.get('ab'), this.jetFilter);
        this.abSrc = loop(this.engBuf.get('ab'), this.roarFilter);
        if (this.ac === ac0) this.engStarted = true;
      } catch {
        // loops are a nice-to-have: wind and warnings still play
      } finally {
        if (this.ac === ac0) this.engLoading = false;
      }
    })();
  }

  /** fetch + decode the GPWS samples once (works while the context is suspended) */
  private ensureVoices(): void {
    const ac = this.ac;
    if (!ac || this.voicesReady || this.voicesLoading) return;
    this.voicesLoading = true;
    const ac0 = ac;
    const urls = [cautionTerrainUrl, pullUpUrl, terrainTerrainUrl, tooLowGearUrl, windshearUrl];
    const names = ['caution', 'pullup', 'terrterr', 'toolowgear', 'windshear'];
    void (async () => {
      try {
        if (!voiceBytes) {
          voiceBytes = await Promise.all(urls.map(async (u) => (await fetch(u)).arrayBuffer()));
        }
        // decodeAudioData detaches its input, so decode a copy per context
        const decoded = await Promise.all(voiceBytes.map((b) => ac0.decodeAudioData(b.slice(0)).catch(() => null)));
        if (this.ac !== ac0) return; // restarted mid-load: the new context re-decodes
        decoded.forEach((buf, i) => {
          if (buf) this.voiceBuf.set(names[i], buf);
        });
      } catch {
        // voices are a nice-to-have: the beeps and the HUD still warn
      } finally {
        if (this.ac === ac0) {
          this.voicesReady = true;
          this.voicesLoading = false;
        }
      }
    })();
  }

  private stopVoice(): void {
    if (this.voiceSrc) {
      try {
        this.voiceSrc.stop();
      } catch {
        // already ended
      }
      try {
        this.voiceSrc.disconnect();
      } catch {
        // already gone
      }
      this.voiceSrc = null;
    }
    this.voiceEndsAt = 0;
  }

  /**
   * GPWS voice callouts, by alert priority — windshear first, then PULL UP,
   * TOO LOW GEAR and the TERRAIN caution. One voice at a time: a higher
   * priority alert pre-empts whatever is playing, warnings hammer until
   * clear and cautions remind every few seconds.
   */
  private updateVoices(sim: Sim): void {
    const ac = this.ac;
    if (!ac) return;
    this.ensureVoices();
    if (!this.voicesReady) return;
    const t = ac.currentTime;
    let want = '';
    if (sim.alive) {
      if (sim.windshear) want = 'windshear';
      else if (sim.pullUp) want = 'pullup';
      else if (sim.tooLowGear) want = 'toolowgear';
      else if (sim.terrainAhead) want = 'caution';
    }
    if (!sim.pullUp) this.pullUpTerrainSaid = false; // re-arm the opening shout
    if (want !== this.voiceId) {
      this.stopVoice();
      this.voiceId = want;
      this.voiceNextAt = t; // a new alert speaks immediately
    }
    if (!want) return;
    if (t < this.voiceEndsAt || t < this.voiceNextAt) return;
    let bufName = want;
    if (want === 'pullup') {
      bufName = this.pullUpTerrainSaid ? 'pullup' : 'terrterr';
      this.pullUpTerrainSaid = true;
    }
    let buf = this.voiceBuf.get(bufName);
    if (!buf && bufName === 'terrterr') {
      buf = this.voiceBuf.get('pullup'); // fall back to PULL UP if the opener is missing
      bufName = 'pullup';
    }
    if (!buf) {
      this.voiceNextAt = t + 1;
      return;
    }
    const src = ac.createBufferSource();
    src.buffer = buf;
    src.connect(this.voiceGain);
    src.start();
    this.voiceSrc = src;
    this.voiceEndsAt = t + buf.duration;
    const gap = want === 'pullup' ? 0.45 : want === 'windshear' ? 0.6 : want === 'toolowgear' ? 2.2 : 5.0;
    this.voiceNextAt = this.voiceEndsAt + gap;
  }

  dispose(): void {
    this.stopVoice();
    this.voicesReady = false;
    this.voicesLoading = false;
    this.engStarted = false;
    this.engLoading = false;
    if (this.ac) {
      void this.ac.close();
      this.ac = null;
    }
    this.lastAlive = true;
    this.lastGrounded = true;
    this.lastCat = false;
    this.lastArrested = false;
  }
}
