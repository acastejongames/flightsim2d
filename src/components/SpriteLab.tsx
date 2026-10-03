import { useEffect, useRef, useState } from 'react';
import { AIRCRAFT, getAircraft } from '../game/aircraft';
import type { AircraftId } from '../game/aircraft';
import { drawAircraft } from '../game/sprites';
import { TODS } from '../game/world';
import type { TimeOfDay } from '../game/world';
import { t2, useLang } from '../game/i18n';

/**
 * Sprite lab — a big, controllable view of the aircraft renderer.
 *
 * Useful while drawing new sprites: pick an airframe, then play with gear, flaps,
 * hook, thrust, pitch and the time of day to check every pose the game can ask for
 * (daylight colours, night lighting, damaged wreck, prop phase…).
 */
export default function SpriteLab({ onBack }: { onBack: () => void }) {
  const lang = useLang();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [acId, setAcId] = useState<AircraftId>('sparrow');
  const [gear, setGear] = useState(1);
  const [flaps, setFlaps] = useState(0);
  const [hook, setHook] = useState(0);
  const [thrust, setThrust] = useState(0.6);
  const [pitch, setPitch] = useState(0);
  const [tod, setTod] = useState<TimeOfDay>('day');
  const [crashed, setCrashed] = useState(false);
  const [zoom, setZoom] = useState(1);

  const ref = useRef({ gear, flaps, hook, thrust, pitch, tod, crashed, zoom, acId });
  ref.current = { gear, flaps, hook, thrust, pitch, tod, crashed, zoom, acId };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    const loop = (now: number) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const P = ref.current;
      const spec = getAircraft(P.acId);
      const light = TODS[P.tod].light;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // grid
      ctx.fillStyle = '#0b1220';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(120,160,220,0.18)';
      ctx.lineWidth = 1;
      const stepM = 1;
      const scale = Math.min((w * 0.8) / (spec.length * 1.25), (h * 0.7) / Math.max(3, spec.length * 0.45)) * P.zoom;
      const cx = w / 2 - (spec.length * 0.35) * scale * 0;
      const cy = h / 2;
      ctx.save();
      ctx.translate(cx, cy - 10);
      for (let gx = -14; gx <= 14; gx += stepM) {
        ctx.beginPath();
        ctx.moveTo(gx * scale, -h);
        ctx.lineTo(gx * scale, h);
        ctx.stroke();
      }
      ctx.restore();
      // ground line
      ctx.strokeStyle = 'rgba(160,200,255,0.35)';
      ctx.beginPath();
      ctx.moveTo(0, cy + spec.gearH * scale);
      ctx.lineTo(w, cy + spec.gearH * scale);
      ctx.stroke();
      // aircraft, drawn in metres exactly like the game does
      ctx.save();
      ctx.translate(cx, cy - 10);
      ctx.rotate(-P.pitch);
      ctx.scale(scale, -scale);
      drawAircraft(ctx, spec, {
        gear: spec.fixedGear ? 1 : P.gear,
        flaps: P.flaps,
        hook: P.hook,
        thrust: P.thrust,
        phase: now / 1000 * (6 + P.thrust * 70),
        time: now / 1000,
        night: TODS[P.tod].night,
        light: light.map((v) => v * (P.crashed ? 0.35 : 1)),
        crashed: P.crashed,
      });
      ctx.restore();
      ctx.font = '600 11px ui-monospace, monospace';
      ctx.fillStyle = 'rgba(190,215,240,0.75)';
      ctx.fillText(`${spec.name} · ${spec.length.toFixed(1)} m · ${t2('1 m grid', 'cuadrícula de 1 m')}`, 12, h - 12);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const chip = (on: boolean) => `rounded-sm px-3 py-2 text-xs font-bold uppercase ring-1 ${
    on ? 'bg-sky-500 text-slate-950 ring-sky-300' : 'bg-white/5 text-slate-300 ring-white/10 hover:bg-white/15'
  }`;
  const num = (label: string, value: number, set: (v: number) => void, min: number, max: number, step: number) => (
    <label className="block">
      <div className="flex items-baseline justify-between font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
        <span>{label}</span>
        <span className="text-sky-200">{value.toFixed(2)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => set(parseFloat(e.target.value))}
        className="h-4 w-full cursor-pointer accent-sky-400"
      />
    </label>
  );

  return (
    <div className="min-h-screen w-full bg-slate-950 text-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 py-8 sm:px-8">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-black tracking-tight">🎨 {t2('Sprite lab', 'Laboratorio de sprites')}</h1>
            <p className="text-sm text-slate-300">
              {t2(
                'Every pose the game can ask the renderer for, at scale.',
                'Todas las poses que el juego puede pedirle al renderizador, a escala.',
              )}
            </p>
          </div>
          <button onClick={onBack} className="rounded-sm bg-white/10 px-5 py-2.5 text-sm font-bold ring-1 ring-white/15 hover:bg-white/20">
            ← {t2('Back', 'Volver')}
          </button>
        </header>

        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <canvas ref={canvasRef} className="h-[380px] w-full rounded-md ring-1 ring-white/10" />
          <div className="space-y-4 rounded-md bg-slate-900/70 p-4 ring-1 ring-white/10">
            <div>
              <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{t2('Aircraft', 'Aeronave')}</div>
              <div className="grid grid-cols-3 gap-2">
                {AIRCRAFT.map((a) => (
                  <button key={a.id} onClick={() => setAcId(a.id)} className={chip(a.id === acId)}>
                    {a.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{t2('Pose', 'Pose')}</div>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => setGear((g) => (g > 0.5 ? 0 : 1))} className={chip(gear > 0.5)}>
                  {t2('Gear', 'Tren')}
                </button>
                <button onClick={() => setHook((h) => (h > 0.5 ? 0 : 1))} className={chip(hook > 0.5)}>
                  {t2('Hook', 'Gancho')}
                </button>
                <button onClick={() => setCrashed((c) => !c)} className={chip(crashed)}>
                  {t2('Wreck', 'Restos')}
                </button>
              </div>
            </div>
            {num(t2('Flaps', 'Flaps'), flaps, setFlaps, 0, 1, 0.05)}
            {num(t2('Thrust', 'Empuje'), thrust, setThrust, 0, 1, 0.05)}
            {num(t2('Pitch (rad)', 'Morro (rad)'), pitch, setPitch, -0.5, 0.5, 0.01)}
            {num(t2('Zoom', 'Zoom'), zoom, setZoom, 0.4, 2.5, 0.05)}
            <div>
              <div className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{t2('Light', 'Luz')}</div>
              <div className="grid grid-cols-4 gap-2">
                {(['dawn', 'day', 'dusk', 'night'] as TimeOfDay[]).map((id) => (
                  <button key={id} onClick={() => setTod(id)} className={chip(tod === id)}>
                    {lang === 'es' ? TODS[id].label : TODS[id].label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
