import { useCallback, useEffect, useRef, useState } from 'react';import Ico from './Ico';

import { Sim } from '../game/sim';
import type { SimSettings, Input } from '../game/sim';
import { Renderer } from '../game/render';
import type { HudExtra } from '../game/hud';
import { AudioEngine } from '../game/audio';
import { t, useLang } from '../game/i18n';
import { TODS } from '../game/world';
import type { TimeOfDay } from '../game/world';
import { WEATHERS } from '../game/weather';
import {
  SANDBOX_DEFAULT,
  SANDBOX_LIMITS,
  sliderToVis,
  tuneFromPreset,
  visToSlider,
} from '../game/sandbox';
import type { SandboxTune } from '../game/sandbox';
import Controls from './Controls';
import TouchDeck from './TouchDeck';
import type { HoldKey, PitchLever } from './TouchDeck';

interface Props {
  settings: SimSettings;
  onFinish: (summary: ReturnType<Sim['summary']>) => void;
  onQuit: () => void;
  /** persist tuner changes (sandbox stays open the way you left it) */
  onSandbox?: (t: SandboxTune) => void;
}

/** Compact labelled range input used by the sandbox tuner. */
function SbSlider({
  label,
  value,
  min,
  max,
  step,
  fmt,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  fmt: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <div className="flex items-baseline justify-between font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
        <span>{label}</span>
        <span className="text-sky-200">{fmt(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onPointerUp={(e) => (e.target as HTMLElement).blur()}
        className="h-4 w-full cursor-pointer accent-sky-400"
      />
    </label>
  );
}

export default function GameView({ settings, onFinish, onQuit, onSandbox }: Props) {
  const lang = useLang();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const simRef = useRef<Sim | null>(null);
  const audioRef = useRef<AudioEngine | null>(null);
  const rendRef = useRef<Renderer | null>(null);
  const pausedRef = useRef(false);
  const mutedRef = useRef(false);
  /** hold buttons on the touch deck (brake + rudder) */
  const holdRef = useRef<Record<HoldKey, boolean>>({ brake: false, rudL: false, rudR: false });
  /** spring-loaded pitch lever on the touch deck */
  const pitchRef = useRef<PitchLever>({ v: 0, live: false });
  const wrapRef = useRef<HTMLDivElement>(null);
  const topBarRef = useRef<HTMLDivElement>(null);
  /** measured px taken by the touch deck / top bar, so the HUD and banners dodge them */
  const deckPxRef = useRef(0);
  const barPxRef = useRef(0);
  const [deckH, setDeckH] = useState(0);
  const onDeckMeasure = useCallback((h: number) => {
    deckPxRef.current = h;
    setDeckH(h);
  }, []);
  const onBarMeasure = useCallback((w: number) => {
    barPxRef.current = w;
  }, []);
  const [paused, setPausedState] = useState(false);
  const [muted, setMutedState] = useState(false);
  const [coarse, setCoarse] = useState(false);
  const compactRef = useRef(false);
  const [crashed, setCrashed] = useState(false);
  const [missionDone, setMissionDone] = useState(false);
  const [missionFailed, setMissionFailed] = useState(false);
  const [tune, setTune] = useState<SandboxTune>(() => ({ ...(settings.sandbox ?? SANDBOX_DEFAULT) }));
  const [warp, setWarp] = useState(1);
  const warpRef = useRef(1);
  const [showTuner, setShowTuner] = useState(false);

  const setPaused = useCallback((p: boolean) => {
    if (p) {
      // let go of every control the thumbs were holding
      holdRef.current = { brake: false, rudL: false, rudR: false };
      pitchRef.current.live = false;
      pitchRef.current.v = 0;
    }
    pausedRef.current = p;
    setPausedState(p);
    const a = audioRef.current;
    if (a) {
      if (p) a.suspend();
      else a.resume();
    }
  }, []);

  const setMuted = useCallback((m: boolean) => {
    mutedRef.current = m;
    setMutedState(m);
    audioRef.current?.setMuted(m);
  }, []);

  const applyTune = useCallback(
    (next: SandboxTune) => {
      setTune(next);
      simRef.current?.setSandbox(next);
      rendRef.current?.setTod(next.tod);
      onSandbox?.(next);
    },
    [onSandbox],
  );

  const endFlight = useCallback(() => {
    const sim = simRef.current;
    if (!sim) return onQuit();
    onFinish(sim.summary());
  }, [onFinish, onQuit]);

  useEffect(() => {
    const mq = window.matchMedia('(pointer: coarse)');
    const sync = () => {
      const on = mq.matches || window.innerWidth < 560;
      compactRef.current = on;
      setCoarse(on);
    };
    sync();
    mq.addEventListener?.('change', sync);
    window.addEventListener('resize', sync);
    const canvas = canvasRef.current;
    if (!canvas) return;
    const sim = new Sim({ ...settings, touch: compactRef.current });
    const rend = new Renderer(canvas, settings.tod);
    const audio = new AudioEngine();
    audio.init(settings.spec.kind);
    simRef.current = sim;
    rendRef.current = rend;
    audioRef.current = audio;

    const resize = () => rend.resize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio || 1, 2));
    resize();
    window.addEventListener('resize', resize);

    const keys = new Set<string>();
    const handled = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Tab']);

    const onKeyDown = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT')) return;
      if (handled.has(e.code)) e.preventDefault();
      audio.resume();
      if (e.repeat) {
        keys.add(e.code);
        return;
      }
      keys.add(e.code);
      switch (e.code) {
        case 'KeyG':
          sim.toggleGear();
          break;
        case 'KeyF':
          sim.cycleFlaps();
          break;
        case 'KeyH':
          sim.toggleHook();
          break;
        case 'KeyT':
          sim.startTurn();
          break;
        case 'Space':
          sim.launch();
          break;
        case 'KeyY':
          sim.toggleAssist();
          break;
        case 'KeyO':
          sim.toggleAltHold();
          break;
        case 'KeyV':
          sim.toggleSmoke();
          break;
        case 'KeyN': {
          const next = warpRef.current >= 8 ? 1 : warpRef.current * 2; // x1 → x2 → x4 → x8
          warpRef.current = next;
          setWarp(next);
          sim.say(`TIME ×${next}`, 'info', next > 1 ? t('timeWarp') : '', 1.6);
          break;
        }
        case 'KeyK':
          sim.toggleAutoThrottle();
          break;
        case 'KeyR':
          sim.respawn();
          break;
        case 'KeyZ':
          sim.autoThr = false;
          sim.throttle = 0;
          break;
        case 'KeyX':
          sim.autoThr = false;
          sim.throttle = 1;
          break;
        case 'KeyQ':
          sim.trim(-1);
          break;
        case 'KeyE':
          sim.trim(1);
          break;
        case 'KeyM':
          setMuted(!mutedRef.current);
          break;
        case 'Tab':
          extra.showHelp = !extra.showHelp;
          break;
        case 'KeyU':
          setShowTuner((v) => !v);
          break;
        case 'Equal':
        case 'NumpadAdd':
          rend.userZoom = Math.min(5, rend.userZoom * 1.18);
          break;
        case 'Minus':
        case 'NumpadSubtract':
          rend.userZoom = Math.max(0.4, rend.userZoom / 1.18);
          break;
        case 'Escape':
        case 'KeyP':
          setPaused(!pausedRef.current);
          break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.code);
    };
    const onWheel = (e: WheelEvent) => {
      rend.userZoom = Math.min(5, Math.max(0.4, rend.userZoom * Math.exp(-e.deltaY * 0.0012)));
    };
    const onBlur = () => {
      keys.clear();
      setPaused(true);
    };

    // ---- touch: pinch with two fingers to zoom the view
    const el: HTMLElement = canvas;
    const pts = new Map<number, { x: number; y: number }>();
    let pinchD = 0;
    let pinchZoom = 1;
    const spread = (): number => {
      const [a, b] = [...pts.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    const onPD = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      audio.resume();
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size >= 2) {
        pinchD = spread();
        pinchZoom = rend.userZoom;
      }
    };
    const onPM = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size < 2 || pinchD <= 0) return;
      e.preventDefault();
      const d = spread();
      rend.userZoom = Math.min(5, Math.max(0.4, (pinchZoom * d) / pinchD));
    };
    const onPU = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      // re-baseline (or end) the gesture so a stray finger never jumps the zoom
      if (pts.size >= 2) {
        pinchD = spread();
        pinchZoom = rend.userZoom;
      } else pinchD = 0;
    };
    el.addEventListener('pointerdown', onPD);
    el.addEventListener('pointermove', onPM, { passive: false });
    el.addEventListener('pointerup', onPU);
    el.addEventListener('pointercancel', onPU);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('blur', onBlur);

    const extra: HudExtra = { paused: false, fps: 60, muted: false, showHelp: false };
    let last = performance.now();
    let raf = 0;
    const input: Input = { pitch: 0, thr: 0, brake: false, rudder: 0 };
    let wasAlive = true;
    let reported = false;

    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const hold = holdRef.current;
      const lever = pitchRef.current;
      const up = keys.has('ArrowUp') || keys.has('KeyW');
      const down = keys.has('ArrowDown') || keys.has('KeyS');
      const tu = keys.has('ArrowRight') || keys.has('KeyD');
      const td = keys.has('ArrowLeft') || keys.has('KeyA');
      // the spring lever is an absolute elevator demand; the keys add on top
      const pitch = (up ? 1 : 0) - (down ? 1 : 0) + (lever.live ? lever.v : 0);
      input.pitch = pitch > 1 ? 1 : pitch < -1 ? -1 : pitch;
      input.thr = (tu ? 1 : 0) - (td ? 1 : 0);
      input.brake = keys.has('KeyB') || hold.brake;
      input.rudder = (keys.has('KeyL') || hold.rudR ? 1 : 0) - (keys.has('KeyJ') || hold.rudL ? 1 : 0);
      input.turn = keys.has('KeyT');
      if (!pausedRef.current) {
        // time warp runs the sim several times per frame so the physics stays exact
        const steps = warpRef.current;
        for (let i = 0; i < steps; i++) sim.update(dt, input);
        audio.update(sim);
      }
      if (wasAlive && !sim.alive) {
        wasAlive = false;
        setCrashed(true);
      }
      if (!reported && sim.mission) {
        if (sim.mission.status === 'done') {
          reported = true;
          setMissionDone(true);
        } else if (sim.mission.status === 'failed') {
          reported = true;
          setMissionFailed(true);
        }
      }
      extra.paused = pausedRef.current;
      extra.muted = mutedRef.current;
      extra.warp = warpRef.current;
      extra.compact = compactRef.current;
      extra.insetBottom = compactRef.current ? deckPxRef.current : 0;
      extra.insetRight = compactRef.current ? barPxRef.current : 0;
      rend.frame(sim, pausedRef.current ? 0.0001 : dt, extra);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      mq.removeEventListener?.('change', sync);
      window.removeEventListener('resize', sync);
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('blur', onBlur);
      el.removeEventListener('pointerdown', onPD);
      el.removeEventListener('pointermove', onPM);
      el.removeEventListener('pointerup', onPU);
      el.removeEventListener('pointercancel', onPU);
      audio.dispose();
    };
  }, [settings, setPaused, setMuted]);

  /** Publish the top bar width: the compact HUD keeps its objective strip clear of it. */
  useEffect(() => {
    const el = topBarRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => onBarMeasure(el.offsetWidth + 12));
    ro.observe(el);
    onBarMeasure(el.offsetWidth + 12);
    return () => ro.disconnect();
  }, [coarse, settings.sandbox?.on, onBarMeasure]);

  const bumpWarp = useCallback(() => {
    const next = warpRef.current >= 8 ? 1 : warpRef.current * 2; // x1 → x2 → x4 → x8
    warpRef.current = next;
    setWarp(next);
    simRef.current?.say(`TIME ×${next}`, 'info', next > 1 ? t('timeWarp') : '', 1.6);
  }, []);

  const run = simRef.current?.mission;
  const sbOn = !!settings.sandbox?.on;

  return (
    <div ref={wrapRef} className="fixed inset-0 touch-none select-none overflow-hidden bg-black">
      <canvas ref={canvasRef} className="block h-full w-full" />

      {/* top button cluster — icon only on phones so the new compact HUD keeps its strip */}
      <div
        ref={topBarRef}
        className={`absolute z-10 flex gap-2 ${
          coarse ? 'right-2 top-2' : 'left-1/2 top-3 -translate-x-1/2'
        }`}
      >
        <button
          onClick={() => setPaused(!paused)}
          className={`bg-slate-900/70 font-semibold text-slate-100 ring-1 ring-white/15 hover:bg-slate-800/80 ${
            coarse ? 'px-3 py-2 text-xs' : 'px-3.5 py-1.5 text-xs'
          }`}
        >
          <Ico name={paused ? 'play' : 'pause'} size={12} />
          {!coarse && (paused ? t('resume') : t('pause'))}
        </button>
        <button
          onClick={() => setMuted(!muted)}
          className={`bg-slate-900/70 font-semibold text-slate-100 ring-1 ring-white/15 hover:bg-slate-800/80 ${
            coarse ? 'px-3 py-2 text-xs' : 'px-3.5 py-1.5 text-xs'
          }`}
        >
          <Ico name={muted ? 'mute' : 'sound'} size={15} />
        </button>
        {settings.sandbox?.on && (
          <button
            onClick={() => setShowTuner((v) => !v)}
 className={`px-3 font-semibold ring-1 ${coarse ? 'py-2 text-xs' : 'py-1.5 text-xs'} ${
              showTuner ? 'bg-emerald-400 text-slate-950 ring-emerald-300' : 'bg-slate-900/70 text-slate-100 ring-white/15 hover:bg-slate-800/80'
            }`}
          >
            <Ico name="tune" size={12} className={coarse ? '' : 'mr-1 inline -mt-0.5'}/>{!coarse && t('sandbox')}
          </button>
        )}
        {/* a phone gets its flights ended from the pause menu, not by a stray thumb */}
        {!coarse && (
          <button
            onClick={endFlight}
            className="bg-slate-900/70 px-3.5 py-1.5 text-xs font-semibold text-slate-100 ring-1 ring-white/15 hover:bg-slate-800/80"
          >
            <Ico name="stop" size={11} className="mr-1 inline -mt-0.5"/>{t('endFlight')}
          </button>
        )}
      </div>

      {coarse && <TouchDeck
        simRef={simRef}
        pitchRef={pitchRef}
        warp={warp}
        paused={paused}
        onWarp={bumpWarp}
        onHold={(k, down) => {
          holdRef.current[k] = down;
        }}
        onMeasure={onDeckMeasure}
      />}

      {settings.sandbox?.on && showTuner && (
        <div
          className="absolute right-2 top-14 z-20 w-[19.5rem] max-w-[92vw] overflow-y-auto bg-slate-950/90 p-3 text-slate-100 ring-1 ring-emerald-300/30"
          style={{ bottom: coarse ? deckH + 8 : 12 }}
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[11px] font-black uppercase tracking-[0.2em] text-emerald-300"><Ico name="sliders" size={12} className="mr-1 inline -mt-0.5"/>{t('tuner')}</div>
            <button onClick={() => setShowTuner(false)} className="bg-white/10 px-2 py-0.5 text-xs font-bold hover:bg-white/20">
              <Ico name="times" size={14} />
            </button>
          </div>
          <p className="mb-3 text-[10px] leading-snug text-slate-400">{t('sbHint')}</p>

          <div className="mb-3">
            <div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{t('sbPreset')}</div>
            <div className="grid grid-cols-3 gap-1">
              {WEATHERS.map((w) => (
                <button
 key={w.id}
                  onClick={() => applyTune(tuneFromPreset(tune, w.id))}
 className={`px-1 py-1.5 text-[10px] font-bold leading-tight ring-1 ${
                    tune.weather === w.id ? 'bg-sky-500 text-slate-950 ring-sky-300' : 'bg-white/5 text-slate-200 ring-white/10 hover:bg-white/15'
                  }`}
                >
                  <div className="text-base leading-none">{w.icon}</div>
                  {lang === 'es' ? w.es : w.en}
                </button>
              ))}
            </div>
          </div>

          <div className="mb-3">
            <div className="mb-1 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{t('todTitle')}</div>
            <div className="grid grid-cols-4 gap-1">
              {(['dawn', 'day', 'dusk', 'night'] as TimeOfDay[]).map((id) => (
                <button
 key={id}
                  onClick={() => applyTune({ ...tune, tod: id })}
 className={`px-1 py-1.5 text-[10px] font-bold ring-1 ${
                    tune.tod === id ? 'bg-amber-300 text-slate-950 ring-amber-200' : 'bg-white/5 text-slate-200 ring-white/10 hover:bg-white/15'
                  }`}
                >
                  {TODS[id].label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            <SbSlider
              label={t('turnAmount')}
              value={tune.turn}
              {...SANDBOX_LIMITS.turn}
              fmt={(v) => `×${v.toFixed(2)}`}
              onChange={(v) => applyTune({ ...tune, turn: v })}
            />
            <SbSlider
              label={t('sbWind')}
              value={tune.wx}
              {...SANDBOX_LIMITS.wx}
              fmt={(v) => `${v > 0 ? '→' : v < 0 ? '←' : '·'} ${Math.abs(v).toFixed(1)} m/s`}
              onChange={(v) => applyTune({ ...tune, wx: v })}
            />
            <SbSlider
              label={t('sbCross')}
              value={tune.wz}
              {...SANDBOX_LIMITS.wz}
              fmt={(v) => `${v.toFixed(1)} m/s`}
              onChange={(v) => applyTune({ ...tune, wz: v })}
            />
            <SbSlider label={t('sbGust')} value={tune.gust} {...SANDBOX_LIMITS.gust} fmt={(v) => v.toFixed(2)} onChange={(v) => applyTune({ ...tune, gust: v })} />
            <SbSlider label={t('sbTurb')} value={tune.turb} {...SANDBOX_LIMITS.turb} fmt={(v) => v.toFixed(2)} onChange={(v) => applyTune({ ...tune, turb: v })} />
            <SbSlider label={t('sbCloud')} value={tune.cloud} {...SANDBOX_LIMITS.cloud} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => applyTune({ ...tune, cloud: v })} />
            <SbSlider label={t('sbPrecip')} value={tune.precip} {...SANDBOX_LIMITS.precip} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => applyTune({ ...tune, precip: v })} />
            <SbSlider
              label={t('sbVis')}
              value={visToSlider(tune.vis)}
              min={0}
              max={100}
              step={1}
              fmt={() => (tune.vis >= 20000 ? `${(tune.vis / 1000).toFixed(0)} km` : `${Math.round(tune.vis)} m`)}
              onChange={(v) => applyTune({ ...tune, vis: sliderToVis(v) })}
            />
            <SbSlider label={t('sbIce')} value={tune.ice} {...SANDBOX_LIMITS.ice} fmt={(v) => `${Math.round(v * 100)}%`} onChange={(v) => applyTune({ ...tune, ice: v })} />
            <SbSlider label={t('sbTemp')} value={tune.temp} {...SANDBOX_LIMITS.temp} fmt={(v) => `${v.toFixed(0)} °C`} onChange={(v) => applyTune({ ...tune, temp: v })} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <button
              onClick={() => applyTune({ ...tune, god: !tune.god })}
 className={`px-2 py-2 text-[10px] font-bold uppercase ring-1 ${
                tune.god ? 'bg-emerald-400 text-slate-950 ring-emerald-300' : 'bg-white/5 text-slate-300 ring-white/10 hover:bg-white/15'
              }`}
            >
              {t('sbGod')}
            </button>
            <button
              onClick={() => applyTune({ ...tune, fuel: !tune.fuel })}
 className={`px-2 py-2 text-[10px] font-bold uppercase ring-1 ${
                tune.fuel ? 'bg-emerald-400 text-slate-950 ring-emerald-300' : 'bg-white/5 text-slate-300 ring-white/10 hover:bg-white/15'
              }`}
            >
              {t('sbFuel')}
            </button>
          </div>

          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <button
              onClick={() => applyTune(tuneFromPreset({ ...SANDBOX_DEFAULT, on: tune.on, tod: tune.tod }, 'clear'))}
              className="bg-white/10 px-2 py-2 text-[10px] font-bold uppercase ring-1 ring-white/15 hover:bg-white/20"
            >
              <Ico name="refresh" size={12} className="mr-1 inline -mt-0.5" />{t('sbReset')}
            </button>
            <button
              onClick={() => simRef.current?.respawn()}
              className="bg-white/10 px-2 py-2 text-[10px] font-bold uppercase ring-1 ring-white/15 hover:bg-white/20"
            >
              <Ico name="plane" size={12} className="mr-1 inline -mt-0.5"/>{t('respawn')}
            </button>
          </div>

          <div className="mt-2 flex flex-wrap gap-1 text-[10px] font-semibold text-slate-400">
            <span className="rounded bg-white/5 px-1.5 py-0.5">
              {Math.round((simRef.current?.wind.speed ?? 0) * 1.944)} kt
            </span>
            <span className="rounded bg-white/5 px-1.5 py-0.5">
              {t('sbTurb').split(' ')[0]} {(simRef.current?.air.turb ?? 0).toFixed(2)}
            </span>
            <span className="rounded bg-white/5 px-1.5 py-0.5">
              {Math.round((simRef.current?.agl ?? 0))} m AGL
            </span>
            {simRef.current && simRef.current.godSaves > 0 && (
              <span className="rounded bg-emerald-400/15 px-1.5 py-0.5 text-emerald-200">
                <Ico name="shield" size={11} className="mr-1 inline -mt-0.5"/>{simRef.current.godSaves}
              </span>
            )}
          </div>
        </div>
      )}

      {crashed && !paused && (
        <div className="absolute inset-x-0 z-20 flex justify-center" style={{ bottom: coarse ? deckH + 12 : 96 }}>
          <div className="flex items-center gap-3 bg-slate-950/85 px-5 py-3 ring-1 ring-white/15 ">
            <span className="text-sm font-bold text-red-300">{t('crashed')}</span>
            <button
              onClick={() => {
                simRef.current?.respawn();
                setCrashed(false);
              }}
              className="bg-white/10 px-4 py-2 text-xs font-bold ring-1 ring-white/15 hover:bg-white/20"
            >
              <Ico name="refresh" size={13} className="mr-1 inline -mt-0.5"/>{t('respawn')}
            </button>
            <button onClick={endFlight} className="bg-sky-500 px-4 py-2 text-xs font-black text-slate-950 hover:bg-sky-400">
              <Ico name="stop" size={11} className="mr-1 inline -mt-0.5"/>{t('endFlight')}
            </button>
          </div>
        </div>
      )}

      {missionDone && !crashed && (
        <div className="absolute inset-x-0 z-20 flex justify-center" style={{ bottom: coarse ? deckH + 12 : 96 }}>
          <div className="flex items-center gap-3 bg-emerald-950/85 px-5 py-3 ring-1 ring-emerald-300/30 ">
            <span className="text-sm font-bold text-emerald-200"><Ico name="check" size={14} className="mr-1 inline -mt-0.5"/>{t('missionComplete')}</span>
            <button onClick={endFlight} className="bg-emerald-400 px-4 py-2 text-xs font-black text-slate-950 hover:bg-emerald-300">
              {t('debrief')} →
            </button>
          </div>
        </div>
      )}

      {missionFailed && !crashed && !missionDone && (
        <div className="absolute inset-x-0 z-20 flex justify-center" style={{ bottom: coarse ? deckH + 12 : 96 }}>
          <div className="flex items-center gap-3 bg-red-950/85 px-5 py-3 ring-1 ring-red-300/30 ">
            <span className="text-sm font-bold text-red-200"><Ico name="times" size={14} className="mr-1 inline -mt-0.5"/>{t('missionFailed')}</span>
            <button onClick={endFlight} className="bg-white/15 px-4 py-2 text-xs font-bold text-white hover:bg-white/25">
              {t('debrief')} →
            </button>
          </div>
        </div>
      )}

      {paused && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/60 p-4 -sm">
          <div className="max-h-full w-full max-w-2xl overflow-y-auto bg-slate-950/90 p-6 ring-1 ring-white/10">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-2xl font-extrabold tracking-tight text-white">{t('paused')}</h2>
                <p className="text-sm text-slate-400">
                  {settings.spec.name} · {settings.mode === 'carrier' ? t('carrierOps') : t('openWorld')}
                  {run ? ` · ${lang === 'es' ? run.mission.titleEs : run.mission.titleEn}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => {
                    simRef.current?.respawn();
                    setCrashed(false);
                    setPaused(false);
                  }}
                  className="bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/20"
                >
                  <Ico name="refresh" size={12} className="mr-1 inline -mt-0.5" />{t('respawn')}
                </button>
                <button
                  onClick={endFlight}
                  className="bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/15 hover:bg-white/20"
                >
                  <Ico name="stop" size={11} className="mr-1 inline -mt-0.5"/>{t('endFlight')}
                </button>
                {sbOn && (
                  <button
                    onClick={() => {
                      setShowTuner(true);
                      setPaused(false);
                    }}
                    className="bg-emerald-400 px-4 py-2 text-sm font-bold text-slate-950 ring-1 ring-emerald-300/40 hover:bg-emerald-300"
                  >
                    <Ico name="sliders" size={12} className="mr-1 inline -mt-0.5"/>{t('tuner')}
                  </button>
                )}
                <button
                  onClick={() => setPaused(false)}
                  className="bg-sky-500 px-5 py-2 text-sm font-bold text-slate-950 hover:bg-sky-400"
                >
                  {t('resume')}
                </button>
              </div>
            </div>
            {run && (
              <div className="mb-4 bg-black/40 p-4 ring-1 ring-white/10">
                <div className="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-sky-300/80">{t('objective')}</div>
                <div className="text-sm font-semibold text-sky-200">{run.objective(lang)}</div>
                <div className="mt-1 text-xs text-slate-400">
                  {lang === 'es' ? run.mission.briefEs : run.mission.briefEn}
                </div>
                <div className="mt-2 flex flex-wrap gap-3 text-[11px] font-bold text-slate-300">
                  <span>
                    {t('reward')}: <span className="text-amber-300">+{run.totalMoney()} cr</span>
                  </span>
                  <span>
                    {t('weather')}: {lang === 'es' ? simRef.current?.weather.preset.es : simRef.current?.weather.preset.en}
                  </span>
                </div>
              </div>
            )}
            <div className="mb-4 flex flex-wrap gap-2 text-[11px] font-bold">
              <span className={`px-2 py-1 ${simRef.current?.altHold !== null ? 'bg-emerald-400/20 text-emerald-200' : 'bg-white/5 text-slate-400'}`}>
                O · {t('altHold')}
              </span>
              <span className={`px-2 py-1 ${simRef.current?.smokeOn ? 'bg-pink-400/20 text-pink-200' : 'bg-white/5 text-slate-400'}`}>
                V · {t('smoke')}
              </span>
              <span className={`px-2 py-1 ${warp > 1 ? 'bg-amber-400/20 text-amber-200' : 'bg-white/5 text-slate-400'}`}>
                N · {t('timeWarp')} ×{warp}
              </span>
            </div>
            <Controls compact touch={coarse} />
          </div>
        </div>
      )}
    </div>
  );
}
