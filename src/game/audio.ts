import type { Sim } from './sim';

export class AudioEngine {
  private ac: AudioContext | null = null;
  private master!: GainNode;
  private noiseBuf!: AudioBuffer;
  private engGain!: GainNode;
  private osc1!: OscillatorNode;
  private osc2!: OscillatorNode;
  private engFilter!: BiquadFilterNode;
  private jetGain!: GainNode;
  private jetFilter!: BiquadFilterNode;
  private roarGain!: GainNode;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private rumbleGain!: GainNode;
  private rainGain!: GainNode;
  private rainFilter!: BiquadFilterNode;
  private turbGain!: GainNode;
  private beepOsc!: OscillatorNode;
  private beepGain!: GainNode;
  private tremolo!: GainNode;
  private lfo!: OscillatorNode;
  private lastAlive = true;
  private lastGrounded = true;
  private lastCat = false;
  private lastArrested = false;
  private kind: 'prop' | 'jet' = 'prop';
  muted = false;

  init(kind: 'prop' | 'jet'): void {
    this.dispose();
    this.kind = kind;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ac = new AC();
    this.ac = ac;
    this.master = ac.createGain();
    this.master.gain.value = this.muted ? 0 : 0.5;
    this.master.connect(ac.destination);

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

    // piston / turbine tone
    this.engGain = ac.createGain();
    this.engGain.gain.value = 0;
    this.engFilter = ac.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 700;
    this.osc1 = ac.createOscillator();
    this.osc1.type = 'sawtooth';
    this.osc2 = ac.createOscillator();
    this.osc2.type = 'square';
    this.tremolo = ac.createGain();
    this.tremolo.gain.value = 0.7;
    this.lfo = ac.createOscillator();
    this.lfo.frequency.value = 20;
    const lfoGain = ac.createGain();
    lfoGain.gain.value = kind === 'prop' ? 0.3 : 0.05;
    this.lfo.connect(lfoGain);
    lfoGain.connect(this.tremolo.gain);
    this.osc1.connect(this.engFilter);
    this.osc2.connect(this.engFilter);
    this.engFilter.connect(this.tremolo);
    this.tremolo.connect(this.engGain);
    this.engGain.connect(this.master);
    this.osc1.start();
    this.osc2.start();
    this.lfo.start();

    // jet rush
    this.jetFilter = ac.createBiquadFilter();
    this.jetFilter.type = 'bandpass';
    this.jetFilter.frequency.value = 900;
    this.jetFilter.Q.value = 0.7;
    this.jetGain = ac.createGain();
    this.jetGain.gain.value = 0;
    noise().connect(this.jetFilter);
    this.jetFilter.connect(this.jetGain);
    this.jetGain.connect(this.master);

    // afterburner roar
    const roarF = ac.createBiquadFilter();
    roarF.type = 'lowpass';
    roarF.frequency.value = 260;
    this.roarGain = ac.createGain();
    this.roarGain.gain.value = 0;
    noise().connect(roarF);
    roarF.connect(this.roarGain);
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

    if (this.kind === 'prop') {
      const base = s.id === 'corsair' ? 38 : 34;
      const f = base + th * (s.id === 'corsair' ? 62 : 48);
      this.osc1.frequency.setTargetAtTime(f, t, tc);
      this.osc2.frequency.setTargetAtTime(f * 0.503, t, tc);
      this.lfo.frequency.setTargetAtTime(f * 0.5, t, tc);
      this.engFilter.frequency.setTargetAtTime(380 + th * 900, t, tc);
      this.engGain.gain.setTargetAtTime(sim.alive && !sim.engineOut ? 0.12 + th * 0.2 : 0, t, 0.1);
      this.jetGain.gain.setTargetAtTime(0, t, tc);
      this.roarGain.gain.setTargetAtTime(0, t, tc);
    } else {
      const f = 55 + th * 90;
      this.osc1.frequency.setTargetAtTime(f, t, tc);
      this.osc2.frequency.setTargetAtTime(f * 1.5, t, tc);
      this.engFilter.frequency.setTargetAtTime(260 + th * 500, t, tc);
      this.engGain.gain.setTargetAtTime(sim.alive ? 0.04 + th * 0.07 : 0, t, 0.1);
      this.jetFilter.frequency.setTargetAtTime(700 + th * 2600, t, tc);
      this.jetGain.gain.setTargetAtTime(sim.alive ? (0.03 + th * 0.2) * dens : 0, t, 0.12);
      const ab = Math.max(0, th - 0.85) / 0.15;
      this.roarGain.gain.setTargetAtTime(sim.alive ? 0.12 + ab * 0.8 : 0, t, 0.15);
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
    const beep = (sim.stallWarn || sim.pullUp || sim.overspeed) && sim.alive && Math.floor(sim.time * 5) % 2 === 0;
    this.beepOsc.frequency.setTargetAtTime(sim.pullUp ? 980 : 760, t, 0.01);
    this.beepGain.gain.setTargetAtTime(beep ? 0.07 : 0, t, 0.01);

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

  dispose(): void {
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
