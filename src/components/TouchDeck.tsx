/**
 * Phone control deck — the whole in-flight interface for touch devices, in one
 * compact panel pinned to the bottom of the screen:
 *
 *   [THR lever]      [toggle chips]      [PITCH lever]
 *
 * The two levers are pointer-driven divs (not native range inputs) so the thumb
 * is big enough for a thumb. The throttle lever is absolute; the pitch lever is
 * spring-loaded back to neutral, exactly like a stick. Everything else is a
 * chip: gear and flaps show live state, brake and rudder are hold buttons.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import type { Sim } from '../game/sim';
import { t2 } from '../game/i18n';

export type HoldKey = 'brake' | 'rudL' | 'rudR';

/** Shared with the sim loop: elevator demand in -1..1. */
export interface PitchLever {
  v: number;
  live: boolean;
}

interface Props {
  simRef: RefObject<Sim | null>;
  pitchRef: RefObject<PitchLever>;
  warp: number;
  /** pausing hands every control back to neutral */
  paused: boolean;
  onWarp: () => void;
  onHold: (key: HoldKey, down: boolean) => void;
  onMeasure: (h: number) => void;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function buzz(ms: number): void {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* not supported — no problem */
  }
}

// ------------------------------------------------------------------ lever
function Lever({
  label,
  readout,
  value,
  spring,
  onDrag,
  onRelease,
}: {
  label: string;
  readout: string;
  /** 0..1 thumb position (0 = bottom) */
  value: number;
  spring?: boolean;
  onDrag: (v: number) => void;
  onRelease: () => void;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState(false);

  const pick = (clientY: number) => {
    const el = track.current;
    if (!el) return 0.5;
    const r = el.getBoundingClientRect();
    return clamp01(1 - (clientY - r.top) / Math.max(1, r.height));
  };

  const down = (e: React.PointerEvent) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag(true);
    buzz(6);
    onDrag(pick(e.clientY));
  };
  const move = (e: React.PointerEvent) => {
    if (!drag) return;
    e.preventDefault();
    onDrag(pick(e.clientY));
  };
  const up = () => {
    if (!drag) return;
    setDrag(false);
    onRelease();
  };

  const p = clamp01(value);
  const showCentre = spring;
  return (
    <div className="flex w-11 shrink-0 flex-col items-center gap-0.5 sm:w-12">
      <div
        className={`w-full text-center text-[9px] font-black uppercase tracking-[0.14em] ${
          drag ? 'text-sky-300' : 'text-slate-300'
        }`}
      >
        {label}
      </div>
      <div
        ref={track}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        style={{ ['--p' as string]: String(p) } as React.CSSProperties}
        className="relative min-h-[58px] w-full flex-1 rounded-lg bg-black/45 ring-1 ring-white/12"
      >
        {/* fill from the bottom */}
        <div
          className={`absolute inset-x-1.5 bottom-1.5 rounded-md ${spring ? 'bg-gradient-to-t from-violet-500/70 to-violet-300/80' : 'bg-gradient-to-t from-sky-500/80 via-emerald-400/80 to-amber-400/90'}`}
          style={{ height: 'calc((100% - 1.75rem) * var(--p, 0))' }}
        />
        {/* afterburner threshold marker (jets run at >85 %) */}
        {!spring && <div className="absolute inset-x-0.5 top-[15%] border-t border-dashed border-amber-300/70" />}
        {/* neutral detent for the spring lever */}
        {showCentre && <div className="absolute inset-x-0 top-1/2 border-t border-white/45" />}
        <div
          className={`absolute left-1/2 h-3.5 w-10 -translate-x-1/2 rounded-md bg-slate-100 ring-1 ring-black/40 shadow-[0_1px_6px_rgba(0,0,0,0.6)] ${
            drag ? 'scale-y-110' : ''
          }`}
          style={{ bottom: 'calc(0.375rem + (100% - 1.625rem) * var(--p, 0))' }}
        />
      </div>
      <div className="w-full text-center font-mono text-[9.5px] font-bold leading-none text-sky-100">{readout}</div>
    </div>
  );
}

// ------------------------------------------------------------------ chip
function Chip({
  label,
  value,
  on,
  dim,
  hold,
  onTap,
  onHold,
}: {
  label: string;
  value?: string;
  on?: boolean;
  /** greyed out but still tappable (e.g. fixed gear) */
  dim?: boolean;
  hold?: boolean;
  onTap?: () => void;
  onHold?: (down: boolean) => void;
}) {
  const press = (e: React.PointerEvent) => {
    e.preventDefault();
    buzz(7);
    if (hold) {
      e.currentTarget.setPointerCapture(e.pointerId);
      onHold?.(true);
    } else onTap?.();
  };
  const release = () => {
    if (hold) onHold?.(false);
  };
  return (
    <button
      type="button"
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      onLostPointerCapture={release}
      onContextMenu={(e) => e.preventDefault()}
      className={`flex min-h-[40px] select-none flex-col items-center justify-center gap-px overflow-hidden rounded-md px-0.5 py-1 leading-none ring-1 transition-colors ${
        on
          ? 'bg-sky-400 text-slate-950 ring-sky-200'
          : 'bg-white/8 text-slate-100 ring-white/12 active:bg-white/30'
      } ${dim ? 'opacity-45' : ''}`}
    >
      <span className="whitespace-nowrap text-[9px] font-black uppercase tracking-[0.06em]">{label}</span>
      {value !== undefined && <span className={`font-mono text-[10.5px] font-bold ${on ? 'text-slate-900/80' : 'text-sky-200/90'}`}>{value}</span>}
    </button>
  );
}

// ------------------------------------------------------------------ state polled off the sim
interface DeckState {
  thr: number;
  gearCmd: number;
  gear: number;
  flaps: number;
  flapPos: number;
  hook: boolean;
  fixedGear: boolean;
  carrier: boolean;
  brake: boolean;
  turning: boolean;
  alt: boolean;
  smoke: boolean;
  canSmoke: boolean;
  cat: boolean;
  spoiler: boolean;
  alive: boolean;
  emerg: string | null;
  emergAck: boolean;
  canEject: boolean;
  ejected: boolean;
}

const EMPTY: DeckState = {
  thr: 0,
  gearCmd: 1,
  gear: 1,
  flaps: 0,
  flapPos: 0,
  hook: false,
  fixedGear: false,
  carrier: false,
  brake: false,
  turning: false,
  alt: false,
  smoke: false,
  canSmoke: false,
  cat: false,
  spoiler: false,
  alive: true,
  emerg: null,
  emergAck: false,
  canEject: false,
  ejected: false,
};

function snap(sim: Sim): DeckState {
  const em: any = (sim as any).emergency;
  const canEject = !!(sim as any).isFighter && !(sim as any).ejected && sim.alive;
  const ejected = !!(sim as any).ejected;
  return {
    thr: sim.throttle,
    gearCmd: sim.gearCmd,
    gear: sim.gear,
    flaps: sim.flaps,
    flapPos: sim.flapPos,
    hook: sim.hook,
    fixedGear: !!sim.spec.fixedGear,
    carrier: !!sim.spec.carrier,
    brake: sim.input.brake || sim.parked || sim.airbrake > 0.5,
    turning: sim.turning,
    alt: sim.altHold !== null,
    smoke: sim.smokeOn,
    canSmoke: !!sim.spec.displaySmoke,
    cat: sim.catHeld,
    spoiler: sim.spoilerPos > 0.5,
    alive: sim.alive,
    emerg: em ? em.kind : null,
    emergAck: em ? !!em.ack : false,
    canEject,
    ejected,
  };
}

function same(a: DeckState, b: DeckState): boolean {
  return (
    Math.abs(a.thr - b.thr) < 0.01 &&
    a.gearCmd === b.gearCmd &&
    Math.abs(a.gear - b.gear) < 0.2 &&
    a.flaps === b.flaps &&
    a.hook === b.hook &&
    a.carrier === b.carrier &&
    a.brake === b.brake &&
    a.turning === b.turning &&
    a.alt === b.alt &&
    a.smoke === b.smoke &&
    a.canSmoke === b.canSmoke &&
    a.cat === b.cat &&
    a.spoiler === b.spoiler &&
    a.alive === b.alive &&
    a.emerg === b.emerg &&
    a.emergAck === b.emergAck &&
    a.canEject === b.canEject &&
    a.ejected === b.ejected
  );
}

export default function TouchDeck({ simRef, pitchRef, warp, paused, onWarp, onHold, onMeasure }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const [st, setSt] = useState<DeckState>(EMPTY);
  const [thrPos, setThrPos] = useState(0);
  const [pitchPos, setPitchPos] = useState(0.5);
  const [pitchLabel, setPitchLabel] = useState('•');
  const dragging = useRef<'thr' | 'pitch' | null>(null);

  /** Keep the deck's own size published so the HUD and the banners stay clear. */
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const ro = new ResizeObserver(() => onMeasure(el.offsetHeight));
    ro.observe(el);
    onMeasure(el.offsetHeight);
    return () => ro.disconnect();
  }, [onMeasure]);

  /** Poll the sim a few times a second: enough for live chips, no re-render churn. */
  useEffect(() => {
    const tick = () => {
      const sim = simRef.current;
      if (!sim) return;
      setSt((prev) => {
        const next = snap(sim);
        return same(prev, next) ? prev : next;
      });
      if (dragging.current !== 'thr') setThrPos(sim.throttle);
    };
    tick();
    const id = window.setInterval(tick, 110);
    return () => window.clearInterval(id);
  }, [simRef]);

  const setThrottle = useCallback(
    (v: number) => {
      const sim = simRef.current;
      setThrPos(v);
      if (!sim) return;
      // taking the lever overrides the autothrottle, just like Z / X do
      sim.autoThr = false;
      sim.throttle = clamp01(v);
    },
    [simRef],
  );

  const setPitch = useCallback(
    (v: number) => {
      const p = pitchRef.current;
      if (!p) return;
      // small dead zone around the detent so a resting thumb flies straight
      const raw = clamp01(v) * 2 - 1;
      const dead = 0.05;
      const s = Math.sign(raw);
      const mag = Math.max(0, (Math.abs(raw) - dead) / (1 - dead));
      p.v = s * mag;
      p.live = true;
      setPitchPos(clamp01(v));
      setPitchLabel(mag < 0.03 ? '•' : raw > 0 ? `${Math.round(mag * 100)}↑` : `${Math.round(mag * 100)}↓`);
    },
    [pitchRef],
  );

  /** Pause (or losing focus) drops whatever the thumbs were doing. */
  useEffect(() => {
    if (!paused) return;
    dragging.current = null;
    setThrPos(simRef.current?.throttle ?? 0);
    setPitchPos(0.5);
    setPitchLabel('•');
  }, [paused, simRef]);

  const releasePitch = useCallback(() => {
    const p = pitchRef.current;
    if (p) p.live = false;
    setPitchPos(0.5);
    setPitchLabel('•');
  }, [pitchRef]);

  const thrPct = Math.round(thrPos * 100);
  const flapsLabel = ['0', '½', 'F'][st.flaps] ?? '0';
  const moving = Math.abs(st.gearCmd - st.gear) > 0.05;
  const gearLabel = moving ? '···' : st.gearCmd > 0.5 ? t2('DOWN', 'ABAJO') : t2('UP', 'ARRIBA');
  const dnUp = (on: boolean, busy: boolean) => (busy ? '···' : on ? t2('DOWN', 'ABAJO') : t2('UP', 'ARRIBA'));

  return (
    <div ref={root} className="pointer-events-auto fixed inset-x-0 bottom-0 z-20 select-none">
      <div
        className={`mx-auto flex w-full max-w-[720px] items-stretch gap-1.5 border-t border-white/10 bg-slate-950/85 px-1.5 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] shadow-[0_-10px_30px_rgba(0,0,0,0.55)] backdrop-blur-sm ${
          st.alive ? '' : 'opacity-45'
        }`}
      >
        <Lever
          label={t2('THR', 'ACEL')}
          readout={`${thrPct}%`}
          value={thrPos}
          onDrag={(v) => {
            dragging.current = 'thr';
            setThrottle(v);
          }}
          onRelease={() => {
            dragging.current = null;
          }}
        />

        <div className="grid min-w-0 flex-1 grid-cols-[repeat(auto-fit,minmax(46px,1fr))] gap-1 px-1">
          <Chip
            label={t2('GEAR', 'TREN')}
            value={st.fixedGear ? t2('FIX', 'FIJO') : gearLabel}
            on={!st.fixedGear && st.gearCmd > 0.5}
            dim={st.fixedGear}
            onTap={() => simRef.current?.toggleGear()}
          />
          <Chip
            label={t2('FLAPS', 'FLAPS')}
            value={flapsLabel}
            on={st.flaps > 0}
            onTap={() => simRef.current?.cycleFlaps()}
          />
          {st.carrier && (
            <Chip
              label={t2('HOOK', 'GANCHO')}
              value={dnUp(st.hook, false)}
              on={st.hook}
              onTap={() => simRef.current?.toggleHook()}
            />
          )}
          <Chip
            label={t2('BRAKE', 'FRENO')}
            value={st.brake ? t2('ON', 'ON') : t2('OFF', 'OFF')}
            on={st.brake}
            hold
            onHold={(d) => onHold('brake', d)}
          />
          {st.carrier && (
            <Chip
              label={t2('CAT', 'CATAP')}
              value={st.cat ? t2('FIRE', '¡YA!') : '—'}
              on={st.cat}
              onTap={() => simRef.current?.launch()}
            />
          )}
          <Chip
            label={t2('TURN', 'GIRO')}
            value={st.turning ? t2('···', '···') : '180°'}
            on={st.turning}
            onTap={() => simRef.current?.startTurn()}
          />
          <Chip
            label={t2('AP', 'AP')}
            value={st.alt ? t2('HOLD', 'FIJA') : t2('ALT', 'ALT')}
            on={st.alt}
            onTap={() => simRef.current?.toggleAltHold()}
          />
          <Chip
            label={t2('TIME', 'TIEMPO')}
            value={`×${warp}`}
            on={warp > 1}
            onTap={onWarp}
          />
          {st.canSmoke && (
            <Chip
              label={t2('SMOKE', 'HUMO')}
              value={st.smoke ? 'ON' : 'OFF'}
              on={st.smoke}
              onTap={() => simRef.current?.toggleSmoke()}
            />
          )}
          <Chip
            label={t2('SPLR', 'SPLR')}
            value={st.spoiler ? t2('UP', 'FUERA') : t2('DN', 'DENTRO')}
            on={st.spoiler}
            onTap={() => simRef.current?.toggleSpoilers()}
          />
          <Chip label={t2('RUD', 'TIMÓN')} value="←" hold onHold={(d) => onHold('rudL', d)} />
          <Chip label={t2('RUD', 'TIMÓN')} value="→" hold onHold={(d) => onHold('rudR', d)} />
          {st.emerg && (
            <button
              onPointerDown={(e) => { e.preventDefault(); buzz(12); (simRef.current as any)?.ackEmergency?.(); }}
              className={`flex min-h-[40px] flex-col items-center justify-center rounded-md px-0.5 py-1 text-[9px] font-black uppercase leading-none ring-1 ${
                st.emergAck ? 'bg-amber-400/20 text-amber-200 ring-amber-300/40' : 'animate-pulse bg-red-500 text-white ring-red-300'
              }`}
            >
              <span>EMERG</span>
              <span className="font-mono text-[10px]">{st.emergAck ? 'ACK' : st.emerg.slice(0,4).toUpperCase()}</span>
            </button>
          )}
          {(st.canEject || st.ejected) && (
            <button
              onPointerDown={(e) => { e.preventDefault(); buzz(14); if (st.canEject) (simRef.current as any)?.eject?.(); }}
              disabled={st.ejected}
              className={`flex min-h-[40px] flex-col items-center justify-center rounded-md px-0.5 py-1 text-[9px] font-black uppercase leading-none ring-1 ${
                st.ejected ? 'bg-slate-700 text-slate-300 ring-slate-500' : 'animate-pulse bg-red-600 text-white ring-red-300 hover:bg-red-500'
              }`}
            >
              <span>EJECT</span>
              <span className="font-mono text-[10px]">{st.ejected ? 'OUT' : 'READY'}</span>
            </button>
          )}
        </div>

        <Lever
          label={t2('PITCH', 'CABECEO')}
          readout={pitchLabel}
          value={pitchPos}
          spring
          onDrag={(v) => {
            dragging.current = 'pitch';
            setPitch(v);
          }}
          onRelease={() => {
            dragging.current = null;
            releasePitch();
          }}
        />
      </div>
    </div>
  );
}
