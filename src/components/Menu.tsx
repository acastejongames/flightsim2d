import { useMemo, useState } from 'react';
import Ico from './Ico';
import type { IconName } from './Ico';
import { AIRCRAFT, getAircraft } from '../game/aircraft';
import type { AircraftId, AircraftSpec } from '../game/aircraft';
import type { SimSettings } from '../game/sim';
import type { TimeOfDay, WorldMode } from '../game/world';
import { TODS } from '../game/world';
import { WEATHERS } from '../game/weather';
import type { WeatherId } from '../game/weather';
import { generateMission } from '../game/missions';
import type { Mission } from '../game/missions';
import { AIRFRAMES, MEDALS, RANKS, rankFor } from '../game/career';
import type { Profile } from '../game/career';
import { setLang, t, t2, useLang } from '../game/i18n';
import type { SandboxTune } from '../game/sandbox';
import AircraftPreview from './AircraftPreview';
import Controls from './Controls';

/** Section label: typewriter caps with a rule running to the edge of the panel. */
const H2 =
  'mb-3 flex items-center gap-3 font-mono text-[10px] font-bold uppercase tracking-[0.3em] text-sky-300/80 after:h-px after:flex-1 after:bg-sky-300/20';

/** Panel: flat, hairline border, top accent rule. */
function Panel({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <section className={`border border-white/10 bg-slate-950/70 ${className}`}>
      <div className="h-px w-full bg-sky-300/25" />
      <div className="p-4">{children}</div>
    </section>
  );
}

/** Four micro bars instead of a stack of full-width ones. */
function MicroStats({ spec }: { spec: AircraftSpec }) {
  const rows: [string, number][] = [
    ['SPD', spec.stats.speed],
    ['CLB', spec.stats.climb],
    ['AGI', spec.stats.agility],
    ['RNG', spec.stats.range],
  ];
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center gap-1.5">
          <span className="w-7 font-mono text-[9px] tracking-wider text-slate-500">{k}</span>
          <span className="h-1 flex-1 bg-white/10">
            <span className="block h-full bg-sky-400/80" style={{ width: `${v * 100}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

function Seg<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { id: T; label: string; icon?: IconName }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-px border border-white/10 bg-black/30 p-px">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider ${
            value === o.id ? 'bg-sky-400 text-slate-950' : 'text-slate-300 hover:bg-white/10'
          }`}
        >
          {o.icon && <Ico name={o.icon} size={13} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface Props {
  profile: Profile;
  onStart: (settings: SimSettings, mission: Mission | null) => void;
  onHangar: () => void;
  sandbox: SandboxTune;
  onSandbox: (t: SandboxTune) => void;
}

export default function Menu({ profile, onStart, onHangar, sandbox, onSandbox }: Props) {
  const lang = useLang();
  const [mode, setMode] = useState<WorldMode>(profile.mode);
  const [acId, setAcId] = useState<AircraftId>(profile.aircraft);
  const [tod, setTod] = useState<TimeOfDay>('day');
  const [startAir, setStartAir] = useState(false);
  const [weather, setWeather] = useState<WeatherId>(profile.weather);
  const [showCtl, setShowCtl] = useState(false);
  const [contractMode, setContractMode] = useState(true);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000));

  const rank = rankFor(profile.xp);
  const spec: AircraftSpec = getAircraft(acId);
  const owned = profile.owned.includes(acId) || sandbox.on;
  const sb = sandbox.on;

  const mission = useMemo(() => generateMission({ mode, x: 0, seed, rankIndex: rank.index }), [mode, seed, rank.index]);

  const pickMode = (m: WorldMode) => {
    setMode(m);
    if (m === 'carrier' && !spec.carrier) setAcId('ef18');
  };

  const activeWeather: WeatherId = contractMode ? mission.weather : weather;
  const activePreset = WEATHERS.find((w) => w.id === activeWeather) ?? WEATHERS[0];

  const start = () => {
    if (!owned) return;
    const tune: SandboxTune = { ...sandbox, weather: activeWeather, tod };
    onSandbox(tune);
    onStart(
      {
        mode,
        spec: getAircraft(acId),
        tod,
        startAir,
        weather: activeWeather,
        mission: contractMode ? mission : null,
        sandbox: tune,
      },
      contractMode ? mission : null,
    );
  };

  return (
    <div className="relative min-h-screen w-full overflow-y-auto bg-slate-950 text-white">
      <div className="tech-bg pointer-events-none fixed inset-0 bg-cover bg-center opacity-40" style={{ backgroundImage: "url('images/hero-storm.jpg')" }} />
      <div className="pointer-events-none fixed inset-0 bg-slate-950/85" />

      <div className="relative mx-auto flex min-h-screen max-w-[1180px] flex-col px-5 py-6 sm:px-8">
        {/* header */}
        <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-1.5 font-mono text-[10px] font-bold uppercase tracking-[0.34em] text-sky-300/80">{t('tagline')}</div>
            <h1 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
              SKYBOUND
              <span className="ml-3 align-middle font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500">
                {t('version')}
              </span>
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-px border border-white/10">
            {(['en', 'es'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLang(l)}
                className={`px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-widest ${
                  lang === l ? 'bg-sky-400 text-slate-950' : 'bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                {l === 'en' ? 'EN' : 'ES'}
              </button>
            ))}
            <button
              onClick={() => setShowCtl((s) => !s)}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-200 hover:bg-white/10"
            >
              <Ico name="menu" size={13} />
              {showCtl ? t('hideControls') : t('controls')}
            </button>
          </div>
        </header>

        {showCtl && (
          <Panel className="mb-5">
            <Controls />
          </Panel>
        )}

        <div className="grid flex-1 gap-5 lg:grid-cols-[1.25fr_1fr]">
          {/* ------------------------------------------------------------ left: sortie setup */}
          <div className="space-y-5">
            <Panel>
              <h2 className={H2}>{t('modeTitle')}</h2>
              <div className="grid gap-px sm:grid-cols-2">
                {(
                  [
                    { id: 'open', title: t('openWorld'), icon: 'map', text: t('openWorldText') },
                    { id: 'carrier', title: t('carrierOps'), icon: 'anchor', text: t('carrierOpsText') },
                  ] as { id: WorldMode; title: string; icon: IconName; text: string }[]
                ).map((m) => (
                  <button
                    key={m.id}
                    onClick={() => pickMode(m.id)}
                    className={`border p-3 text-left ${
                      mode === m.id ? 'border-sky-300/60 bg-sky-500/15' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Ico name={m.icon} size={18} className="text-sky-200" />
                      <span className="text-base font-bold">{m.title}</span>
                      {mode === m.id && <span className="ml-auto font-mono text-[10px] uppercase tracking-widest text-sky-300">{t('selected')}</span>}
                    </div>
                    <p className="mt-1 text-xs leading-snug text-slate-400">{m.text}</p>
                  </button>
                ))}
              </div>
            </Panel>

            <Panel>
              <h2 className={H2}>{t('aircraftTitle')}</h2>
              <div className="grid gap-px sm:grid-cols-2">
                {AIRCRAFT.map((a) => {
                  const carrierLock = mode === 'carrier' && !a.carrier;
                  const isOwned = profile.owned.includes(a.id);
                  const frame = AIRFRAMES[a.id];
                  const rankOk = sb || rank.index >= frame.rank;
                  const disabled = carrierLock || (!isOwned && !sb);
                  const sel = a.id === acId && !disabled;
                  return (
                    <button
                      key={a.id}
                      disabled={disabled}
                      onClick={() => setAcId(a.id)}
                      className={`relative border p-3 text-left ${
                        sel ? 'border-sky-300/60 bg-sky-500/15' : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.06]'
                      } ${disabled ? 'cursor-not-allowed opacity-40' : ''}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 bg-sky-400/10 px-1 py-0.5">
                          <AircraftPreview spec={a} width={150} height={62} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-bold">{a.name}</div>
                          <div className="font-mono text-[9px] uppercase tracking-widest text-sky-300/80">{a.role}</div>
                          <div className="mt-1.5">
                            <MicroStats spec={a} />
                          </div>
                        </div>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-slate-400">
                        <span className="border border-white/10 px-1.5 py-0.5">Vs {Math.round(a.vs * 1.944)} kt</span>
                        <span className="border border-white/10 px-1.5 py-0.5">{a.gmax} g</span>
                        <span className={`border px-1.5 py-0.5 ${a.carrier ? 'border-amber-300/40 text-amber-200' : 'border-white/10'}`}>
                          {a.carrier ? t('tailhook') : t('noCarrier')}
                        </span>
                        {!isOwned && (
                          <span className={`ml-auto border px-1.5 py-0.5 ${sb ? 'border-emerald-300/40 text-emerald-300' : 'border-amber-300/40 text-amber-300'}`}>
                            {sb ? `${t('free')} · 0 cr` : `${t('locked')} · ${frame.price.toLocaleString()} cr`}
                            {!rankOk && ` · ${RANKS[frame.rank]?.[lang === 'es' ? 'es' : 'en']}`}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </Panel>

            <Panel>
              <h2 className={H2}>{t('weatherTitle')}</h2>
              <div className="flex flex-wrap gap-px">
                {WEATHERS.map((w) => {
                  const active = activeWeather === w.id;
                  return (
                    <button
                      key={w.id}
                      disabled={contractMode}
                      onClick={() => setWeather(w.id)}
                      title={lang === 'es' ? w.descEs : w.descEn}
                      className={`flex items-center gap-1.5 border px-2.5 py-1.5 text-xs font-semibold ${
                        active ? 'border-sky-300/60 bg-sky-500/20 text-white' : 'border-white/10 bg-white/[0.02] text-slate-300 hover:bg-white/[0.07]'
                      } ${contractMode ? 'cursor-not-allowed opacity-45' : ''}`}
                    >
                      <Ico name={w.icon} size={14} className="text-sky-200" />
                      {lang === 'es' ? w.es : w.en}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] leading-snug text-slate-400">
                {contractMode
                  ? t2('The contract decides the weather.', 'El contrato decide el clima.')
                  : lang === 'es'
                    ? activePreset.descEs
                    : activePreset.descEn}
              </p>
            </Panel>

            <div className="grid gap-5 sm:grid-cols-2">
              <Panel>
                <h2 className={H2}>{t('todTitle')}</h2>
                <Seg<TimeOfDay>
                  value={tod}
                  onChange={setTod}
                  options={[
                    { id: 'dawn', label: TODS.dawn.label, icon: 'dawn' },
                    { id: 'day', label: TODS.day.label, icon: 'sun' },
                    { id: 'dusk', label: TODS.dusk.label, icon: 'dusk' },
                    { id: 'night', label: TODS.night.label, icon: 'night' },
                  ]}
                />
              </Panel>
              <Panel>
                <h2 className={H2}>{t('startTitle')}</h2>
                <Seg<'ground' | 'air'>
                  value={startAir ? 'air' : 'ground'}
                  onChange={(v) => setStartAir(v === 'air')}
                  options={
                    mode === 'carrier'
                      ? [
                          { id: 'ground', label: t('onCat'), icon: 'carrier' },
                          { id: 'air', label: t('onFinal'), icon: 'target' },
                        ]
                      : [
                          { id: 'ground', label: t('onRunway'), icon: 'plane' },
                          { id: 'air', label: t('inAir'), icon: 'cloud' },
                        ]
                  }
                />
              </Panel>
            </div>

            <Panel>
              <h2 className={H2}>{t('feelTitle')}</h2>
              <label className="block">
                <div className="mb-1 flex items-baseline justify-between font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  <span>{t('turnAmount')}</span>
                  <span className="text-sky-200">×{sandbox.turn.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min={0.4}
                  max={3}
                  step={0.05}
                  value={sandbox.turn}
                  onChange={(e) => onSandbox({ ...sandbox, turn: parseFloat(e.target.value) })}
                  className="h-4 w-full cursor-pointer accent-sky-400"
                />
                <div className="mt-1 flex justify-between font-mono text-[9px] uppercase tracking-wider text-slate-500">
                  <span>{t2('heavy', 'pesado')}</span>
                  <span>{t2('standard', 'estándar')}</span>
                  <span>{t2('fighter sharp', 'caza')}</span>
                </div>
              </label>
            </Panel>
          </div>

          {/* ------------------------------------------------------------ right: career & launch */}
          <div className="space-y-5">
            <Panel>
              <h2 className={H2}>{t('career')}</h2>
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-lg font-black">{lang === 'es' ? rank.def.es : rank.def.en}</div>
                  <div className="mt-1 h-1.5 w-full bg-white/10">
                    <div className="h-full bg-amber-300" style={{ width: `${rank.progress * 100}%` }} />
                  </div>
                  <div className="mt-1 font-mono text-[10px] tracking-wider text-slate-400">
                    {rank.next ? `${profile.xp} / ${rank.next.xp} XP` : `${profile.xp} XP · MAX`}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[10px] uppercase tracking-widest text-slate-400">{t('money')}</div>
                  <div className="text-lg font-black text-amber-300">{profile.money.toLocaleString(lang === 'es' ? 'es-ES' : 'en-US')}</div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={onHangar}
                  className="flex flex-1 items-center justify-center gap-1.5 border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-wider hover:bg-white/10"
                >
                  <Ico name="wrench" size={13} />
                  {t('hangar')}
                </button>
                <button
                  onClick={onHangar}
                  className="flex items-center gap-1.5 border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-wider hover:bg-white/10"
                >
                  <Ico name="medal" size={13} />
                  {profile.medals.length}/{MEDALS.length}
                </button>
              </div>
            </Panel>

            <Panel className={contractMode ? '' : 'opacity-70'}>
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className={`${H2} mb-0 flex-1`}>{t('todayMission')}</h2>
                <div className="flex gap-px border border-white/10">
                  <button
                    onClick={() => setContractMode(true)}
                    className={`flex items-center gap-1 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-widest ${
                      contractMode ? 'bg-sky-400 text-slate-950' : 'text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <Ico name="contract" size={11} />
                    {t('career')}
                  </button>
                  <button
                    onClick={() => setContractMode(false)}
                    className={`flex items-center gap-1 px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-widest ${
                      !contractMode ? 'bg-sky-400 text-slate-950' : 'text-slate-300 hover:bg-white/10'
                    }`}
                  >
                    <Ico name="plane" size={11} />
                    {t('freeFlight')}
                  </button>
                </div>
              </div>

              {contractMode ? (
                <>
                  <div className="flex items-start gap-2">
                    <Ico name="contract" size={16} className="mt-0.5 shrink-0 text-sky-200" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-base font-bold">{lang === 'es' ? mission.titleEs : mission.titleEn}</span>
                        <span className="flex gap-0.5">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <span key={i} className={`h-2.5 w-1.5 ${i < mission.difficulty ? 'bg-amber-300' : 'bg-white/15'}`} />
                          ))}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-snug text-slate-300">{lang === 'es' ? mission.briefEs : mission.briefEn}</p>
                    </div>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 font-mono text-[11px]">
                    <div className="flex items-center gap-1.5 border border-white/10 px-2 py-1">
                      <Ico name={activePreset.icon} size={12} className="text-sky-200" />
                      <span className="truncate text-slate-300">{lang === 'es' ? activePreset.es : activePreset.en}</span>
                    </div>
                    <div className="flex items-center gap-1.5 border border-emerald-300/30 bg-emerald-400/10 px-2 py-1 text-emerald-200">
                      +{mission.money.toLocaleString()} cr
                    </div>
                    <div className="flex items-center gap-1.5 border border-sky-300/30 bg-sky-400/10 px-2 py-1 text-sky-200">
                      +{mission.xp} XP
                    </div>
                    <div className="flex items-center gap-1.5 border border-white/10 px-2 py-1 text-slate-300">
                      <Ico name="target" size={12} />
                      {mission.gates.length > 0 ? `${mission.gates.length} ${t2('gates', 'balizas')}` : t2('direct', 'directo')}
                    </div>
                  </div>
                  <button
                    onClick={() => setSeed(Math.floor(Math.random() * 100000))}
                    className="mt-3 flex w-full items-center justify-center gap-1.5 border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-wider hover:bg-white/10"
                  >
                    <Ico name="refresh" size={13} />
                    {t('reroll')}
                  </button>
                </>
              ) : (
                <p className="text-xs leading-snug text-slate-400">{t('weatherHint')}</p>
              )}
            </Panel>

            <Panel className={sb ? 'border-emerald-300/40' : ''}>
              <div className="flex items-center gap-2">
                <h2 className={`${H2} mb-0 flex-1`}>{t('sandboxTitle')}</h2>
                <button
                  onClick={() => onSandbox({ ...sandbox, on: !sb })}
                  className={`px-2.5 py-1 font-mono text-[10px] font-black uppercase tracking-widest ${
                    sb ? 'bg-emerald-400 text-slate-950' : 'bg-white/10 text-slate-300 hover:bg-white/20'
                  }`}
                >
                  {sb ? t('on') : t('off')}
                </button>
              </div>
              <p className="mt-2 text-xs leading-snug text-slate-400">{t('sandboxText')}</p>
              {sb && (
                <div className="mt-2 flex flex-wrap gap-1 font-mono text-[10px] uppercase tracking-wider text-emerald-300">
                  <span className="border border-emerald-300/30 px-1.5 py-0.5">{t('sbGod')}</span>
                  <span className="border border-emerald-300/30 px-1.5 py-0.5">{t('sbFuel')}</span>
                  <span className="border border-emerald-300/30 px-1.5 py-0.5">{t('tuner')} · U</span>
                </div>
              )}
            </Panel>

            <button
              onClick={start}
              disabled={!owned}
              className={`flex w-full items-center justify-center gap-3 py-4 text-lg font-black uppercase tracking-[0.2em] ${
                owned ? 'bg-sky-400 text-slate-950 hover:bg-sky-300' : 'cursor-not-allowed bg-slate-800 text-slate-500'
              }`}
            >
              {contractMode ? t('flyMission') : t('startEngines')}
              <Ico name="right" size={18} />
            </button>
          </div>
        </div>

        <p className="mt-4 font-mono text-[10px] uppercase tracking-wider text-slate-500">
          {t2(
            'J/L rudder · G gear · F flaps · T turn (hold to chain) · O alt hold · N time ×1-8 · V smoke · U tuner · P pause',
            'J/L timón · G tren · F flaps · T giro (mantén para encadenar) · O altitud · N tiempo ×1-8 · V humo · U panel · P pausa',
          )}
        </p>
      </div>
    </div>
  );
}
