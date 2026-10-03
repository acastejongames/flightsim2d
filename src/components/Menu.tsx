import { useMemo, useState } from 'react';import Ico from './Ico';
import type { IconName } from './Ico';

import { AIRCRAFT, getAircraft } from '../game/aircraft';
import type { AircraftId, AircraftSpec } from '../game/aircraft';
import type { SimSettings } from '../game/sim';
import type { TimeOfDay, WorldMode } from '../game/world';
import { TODS } from '../game/world';
import { WEATHERS } from '../game/weather';
import type { WeatherId } from '../game/weather';
import { generateMission, missionIcon } from '../game/missions';
import type { Mission } from '../game/missions';
import { AIRFRAMES, MEDALS, RANKS, rankFor } from '../game/career';
import type { Profile } from '../game/career';
import { setLang, t, t2, useLang } from '../game/i18n';
import type { SandboxTune } from '../game/sandbox';
import AircraftPreview from './AircraftPreview';
import Controls from './Controls';

const H2 = 'mb-3 flex items-center gap-3 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-sky-300/80 after:h-px after:flex-1 after:bg-sky-300/20';

function Bar({ label, v, color = 'from-sky-400 to-cyan-300' }: { label: string; v: number; color?: string }) {
  return (
    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-slate-400">
      <span className="w-14">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
        <div className={`h-full rounded-full bg-gradient-to-r ${color}`} style={{ width: `${v * 100}%` }} />
      </div>
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
    <div className="inline-flex flex-wrap gap-1 rounded-sm bg-black/30 p-1 ring-1 ring-white/10">
      {options.map((o) => (
        <button
 key={o.id}
          onClick={() => onChange(o.id)}
 className={`rounded-sm px-3.5 py-2 text-sm font-semibold ${
            value === o.id ? 'bg-sky-500 text-slate-950' : 'text-slate-300 hover:bg-white/10'
          }`}
        >
          {o.icon && <Ico name={o.icon} size={14} className="mr-1.5 inline -mt-0.5" />}
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

  const mission = useMemo(
    () =>
      generateMission({
        mode,
        x: 0,
        seed,
        rankIndex: rank.index,
      }),
    [mode, seed, rank.index],
  );

  const pickMode = (m: WorldMode) => {
    setMode(m);
    if (m === 'carrier' && !spec.carrier) setAcId('ef18');
  };

  const activeWeather: WeatherId = contractMode ? mission.weather : weather;

  const start = () => {
    if (!owned) return;
    const tune: SandboxTune | null = sb ? { ...sandbox, weather: activeWeather, tod } : null;
    if (tune) onSandbox(tune);
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
      <div
      className="pointer-events-none fixed inset-0 bg-cover bg-center opacity-50"
        style={{ backgroundImage: "url('images/hero-storm.jpg')" }}
      />
      <div className="pointer-events-none fixed inset-0 bg-slate-950/80" />

      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-8 sm:px-8">
        {/* header */}
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-sky-400/15 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-sky-200 ring-1 ring-sky-300/25">
              {t('tagline')}
            </div>
            <h1 className="bg-gradient-to-r from-white via-sky-100 to-sky-300 bg-clip-text text-5xl font-black tracking-tight text-transparent sm:text-6xl">
              SKYBOUND
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-300">{t('blurb')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex overflow-hidden rounded-sm ring-1 ring-white/15">
              {(['en', 'es'] as const).map((l) => (
                <button
 key={l}
                  onClick={() => setLang(l)}
 className={`px-3 py-2 text-xs font-bold uppercase ${
                    lang === l ? 'bg-sky-500 text-slate-950' : 'bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {l === 'en' ? 'EN' : 'ES'}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowCtl((s) => !s)}
              className="rounded-sm bg-white/10 px-4 py-2 text-sm font-semibold ring-1 ring-white/15 hover:bg-white/20"
            >
              {showCtl ? t('hideControls') : t('controls')}
            </button>
          </div>
        </header>

        {/* career strip */}
        <section className="mb-8 grid gap-3 rounded-md bg-slate-900/70 p-4 ring-1 ring-white/10 sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-center">
          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{t('rank')}</div>
            <div className="text-lg font-black text-white">
              {lang === 'es' ? rank.def.es : rank.def.en}
              <span className="ml-2 text-xs font-semibold text-slate-400">
                {rank.next ? `/ ${Math.round(rank.next.xp - profile.xp)} XP` : '· MAX'}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-amber-300" style={{ width: `${rank.progress * 100}%` }} />
            </div>
          </div>
          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{t('money')}</div>
            <div className="text-lg font-black text-amber-300">{profile.money.toLocaleString(lang === 'es' ? 'es-ES' : 'en-US')} cr</div>
          </div>
          <div>
            <div className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{t('medals')}</div>
            <button onClick={onHangar} className="text-lg font-black text-sky-200 hover:text-sky-100">
              <Ico name="medal" size={15} className="mr-1 inline -mt-0.5" />{profile.medals.length}/{MEDALS.length}
            </button>
          </div>
          <button
            onClick={onHangar}
            className="rounded-sm bg-sky-400 px-5 py-3 text-sm font-black text-slate-950 "
          >
            <Ico name="wrench" size={14} className="mr-1.5 inline -mt-0.5"/>{t('hangar')}
          </button>
        </section>

        {showCtl && (
          <div className="mb-8 rounded-md bg-slate-900/80 p-6 ring-1 ring-white/10 ">
            <Controls />
          </div>
        )}

        {/* mode */}
        <section className="mb-8">
          <h2 className={H2}>{t('modeTitle')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                { id: 'open', title: t('openWorld'), icon: 'map', text: t('openWorldText') },
                { id: 'carrier', title: t('carrierOps'), icon: 'anchor', text: t('carrierOpsText') },
              ] as { id: WorldMode; title: string; icon: IconName; text: string }[]
            ).map((m) => (
              <button
 key={m.id}
                onClick={() => pickMode(m.id)}
 className={`group rounded-md p-5 text-left ring-1 ${
                  mode === m.id ? 'bg-sky-500/20 ring-sky-300/60' : 'bg-slate-900/60 ring-white/10 hover:bg-slate-900/80'
                }`}
              >
                <div className="mb-1 flex items-center gap-3">
                  <Ico name={m.icon} size={24} className="text-sky-200" />
                  <span className="text-xl font-bold">{m.title}</span>
                  {mode === m.id && <span className="ml-auto rounded-sm bg-sky-400 px-2 py-0.5 text-[10px] font-bold text-slate-950">{t('selected')}</span>}
                </div>
                <p className="text-sm text-slate-300">{m.text}</p>
              </button>
            ))}
          </div>
        </section>

        {/* aircraft */}
        <section className="mb-8">
          <h2 className={H2}>{t('aircraftTitle')}</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {AIRCRAFT.map((a) => {
              const carrierLock = mode === 'carrier' && !a.carrier; // only the EF-18 flies off the boat
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
 className={`relative overflow-hidden rounded-md p-4 text-left ring-1 ${
                    sel ? 'bg-sky-500/20 ring-sky-300/60' : 'bg-slate-900/60 ring-white/10 hover:bg-slate-900/80'
                  } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <div className="flex justify-center rounded-sm bg-sky-400/10 py-2">
                    <AircraftPreview spec={a} />
                  </div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <span className="text-lg font-bold">{a.name}</span>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-300">{a.role}</span>
                  </div>
                  <p className="mb-3 mt-1 min-h-[3.2rem] text-xs leading-relaxed text-slate-300">{a.desc}</p>
                  <div className="space-y-1.5">
                    <Bar label="Speed" v={a.stats.speed} />
                    <Bar label="Climb" v={a.stats.climb} />
                    <Bar label="Agility" v={a.stats.agility} />
                    <Bar label="Range" v={a.stats.range} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] font-semibold">
                    <span className="rounded-md bg-white/10 px-2 py-0.5 text-slate-200">Vs {Math.round(a.vs * 1.944)} kt</span>
                    <span className="rounded-md bg-white/10 px-2 py-0.5 text-slate-200">{a.gmax} g</span>
                    {a.carrier ? (
                      <span className="rounded-md bg-amber-400/20 px-2 py-0.5 text-amber-200">Tailhook</span>
                    ) : (
                      <span className="rounded-md bg-white/5 px-2 py-0.5 text-slate-400">No carrier ops</span>
                    )}
                  </div>
                  {!isOwned && (
                    <div className={`absolute right-3 top-3 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wider ring-1 ${
                      sb ? 'bg-emerald-400/90 text-slate-950 ring-emerald-200/60' : 'bg-slate-950/85 text-amber-300 ring-amber-300/40'
                    }`}>
                      <Ico name={sb ? 'tune' : 'lock'} size={11} className="mr-1 inline -mt-0.5" />
                      {sb ? `${t('free')} · 0 cr` : `${t('locked')} · ${frame.price.toLocaleString()} cr${rankOk ? '' : ` · ${t('needRank')} ${RANKS[frame.rank]?.[lang === 'es' ? 'es' : 'en']}`}`}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
            <Ico name={sb ? 'tune' : 'plane'} size={12} />
            {sb
              ? t2('Sandbox: every aircraft is free to fly right now.', 'Sandbox: ahora mismo puedes volar cualquier avión gratis.')
              : `${owned ? `${t('owned')} ·` : ''} ${t('buy')}:`}
            {!sb && <button onClick={onHangar} className="text-sky-300 underline">{t('hangar')}</button>}
          </p>
        </section>

        {/* contract */}
        <section className="mb-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className={H2}>{t('todayMission')}</h2>
            <div className="inline-flex overflow-hidden rounded-sm ring-1 ring-white/15">
              <button
                onClick={() => setContractMode(true)}
 className={`px-3.5 py-2 text-xs font-bold uppercase ${contractMode ? 'bg-sky-500 text-slate-950' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
              >
                <Ico name="contract" size={13} className="mr-1.5 inline -mt-0.5"/>{t('career')}
              </button>
              <button
                onClick={() => setContractMode(false)}
 className={`px-3.5 py-2 text-xs font-bold uppercase ${!contractMode ? 'bg-sky-500 text-slate-950' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
              >
                <Ico name="plane" size={13} className="mr-1.5 inline -mt-0.5"/>{t('freeFlight')}
              </button>
            </div>
          </div>
          <div className={`rounded-md p-5 ring-1 ${contractMode ? 'bg-slate-900/75 ring-sky-300/30' : 'bg-slate-900/50 ring-white/10 opacity-80'}`}>
            {contractMode ? (
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-2xl">{missionIcon(mission.kind)}</span>
                    <span className="text-xl font-bold">{lang === 'es' ? mission.titleEs : mission.titleEn}</span>
                    <span className="rounded-md bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-200">
                      {Array.from({ length: mission.difficulty }).map((_, i) => (
                        <Ico key={i} name="star" size={11} filled className="mr-0.5 inline -mt-0.5 text-amber-200" />
                      ))}
                    </span>
                  </div>
                  <p className="text-sm text-slate-300">{lang === 'es' ? mission.briefEs : mission.briefEn}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
                    {(() => {
                      const w = WEATHERS.find((x) => x.id === mission.weather) ?? WEATHERS[0];
                      return (
                        <span className="rounded-md bg-white/10 px-2 py-1 text-slate-200">
                          <Ico name={w.icon} size={13} className="mr-1 inline -mt-0.5"/>{lang === 'es' ? w.es : w.en}
                        </span>
                      );
                    })()}
                    <span className="rounded-md bg-emerald-400/15 px-2 py-1 text-emerald-200">
                      +{mission.money.toLocaleString()} cr
                    </span>
                    <span className="rounded-md bg-sky-400/15 px-2 py-1 text-sky-200">+{mission.xp} XP</span>
                    {mission.timeLimit && (
                      <span className="rounded-md bg-white/10 px-2 py-1 text-slate-200"><Ico name="clock" size={12} className="mr-1 inline -mt-0.5"/>{Math.round(mission.timeLimit / 60)} min</span>
                    )}
                    {mission.gates.length > 0 && (
                      <span className="rounded-md bg-white/10 px-2 py-1 text-slate-200">
                        <Ico name="target" size={12} className="mr-1 inline -mt-0.5"/>{mission.gates.length} {t2('waypoints', 'balizas')}
                      </span>
                    )}
                    {mission.ceilAgl && (
                      <span className="rounded-md bg-white/10 px-2 py-1 text-slate-200">↓ {mission.ceilAgl} m</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSeed(Math.floor(Math.random() * 100000))}
                  className="rounded-sm bg-white/10 px-4 py-2 text-sm font-semibold ring-1 ring-white/15 hover:bg-white/20"
                >
                  <Ico name="refresh" size={14} className="mr-1.5 inline -mt-0.5"/>{t('reroll')}
                </button>
              </div>
            ) : (
              <p className="text-sm text-slate-300">{t('weatherHint')}</p>
            )}
          </div>
        </section>

        {/* weather + tod + start */}
        <section className="mb-8">
          <h2 className={H2}>{t('weatherTitle')}</h2>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {WEATHERS.map((w) => {
              const active = activeWeather === w.id;
              return (
                <button
 key={w.id}
                  disabled={contractMode}
                  onClick={() => setWeather(w.id)}
 className={`rounded-sm p-3 text-left ring-1 ${
                    active ? 'bg-sky-500/20 ring-sky-300/60' : 'bg-slate-900/60 ring-white/10 hover:bg-slate-900/80'
                  } ${contractMode ? 'cursor-not-allowed opacity-45' : ''}`}
                >
                  <Ico name={w.icon} size={22} className="text-sky-200" />
                  <div className="text-sm font-bold">{lang === 'es' ? w.es : w.en}</div>
                  <div className="text-[11px] leading-snug text-slate-400">{lang === 'es' ? w.descEs : w.descEn}</div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mb-8 grid gap-6 sm:grid-cols-2">
          <div>
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
          </div>
          <div>
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
          </div>
          <div className="sm:col-span-2">
            <h2 className={H2}>{t('feelTitle')}</h2>
            <div className="rounded-md bg-slate-900/60 p-5 ring-1 ring-white/10">
              <div className="flex flex-wrap items-center gap-6">
                <label className="min-w-[240px] flex-1">
                  <div className="mb-1 flex items-baseline justify-between font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    <span className="flex items-center gap-1.5"><Ico name="refresh" size={12} />{t('turnAmount')}</span>
                    <span className="text-sky-200">×{sandbox.turn.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min={0.4}
                    max={3}
                    step={0.05}
                    value={sandbox.turn}
                    onChange={(e) => onSandbox({ ...sandbox, turn: parseFloat(e.target.value) })}
                    className="h-5 w-full cursor-pointer accent-sky-400"
                  />
                  <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wider text-slate-500">
                    <span>{t2('heavy', 'pesado')}</span>
                    <span>{t2('standard', 'estándar')}</span>
                    <span>{t2('fighter sharp', 'caza')}</span>
                  </div>
                </label>
                <p className="max-w-md text-xs text-slate-400">{t('turnHint')}</p>
              </div>
            </div>
          </div>
        </section>

        {/* sandbox */}
        <section className="mb-8">
          <h2 className={H2}>{t('sandboxTitle')}</h2>
          <button
            onClick={() => onSandbox({ ...sandbox, on: !sandbox.on })}
 className={`w-full rounded-md p-5 text-left ring-1 ${
              sb
                ? 'bg-emerald-500/15 ring-emerald-300/50 '
                : 'bg-slate-900/60 ring-white/10 hover:bg-slate-900/80'
            }`}
          >
            <div className="mb-1 flex flex-wrap items-center gap-3">
              <Ico name="tune" size={24} className="text-emerald-300" />
              <span className="text-xl font-bold">{t('sandbox')}</span>
              <span
 className={`rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                  sb ? 'bg-emerald-400 text-slate-950' : 'bg-white/10 text-slate-300'
                }`}
              >
                {sb ? t('sandboxOn') : t('sandboxOff')}
              </span>
            </div>
            <p className="max-w-3xl text-sm text-slate-300">{t('sandboxText')}</p>
            {sb && (
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold text-emerald-200">
                <span className="rounded-lg bg-emerald-400/15 px-2 py-1"><Ico name="shield" size={12} className="mr-1 inline -mt-0.5"/>{t('sbGod')}</span>
                <span className="rounded-lg bg-emerald-400/15 px-2 py-1"><Ico name="fuel" size={12} className="mr-1 inline -mt-0.5"/>{t('sbFuel')}</span>
                <span className="rounded-lg bg-emerald-400/15 px-2 py-1"><Ico name="plane" size={12} className="mr-1 inline -mt-0.5"/>0 cr</span>
                <span className="rounded-lg bg-emerald-400/15 px-2 py-1"><Ico name="sliders" size={12} className="mr-1 inline -mt-0.5"/>{t('tuner')} (U)</span>
              </div>
            )}
          </button>
        </section>

        <div className="mt-auto flex flex-wrap items-center justify-between gap-4 pb-4">
          <p className="max-w-lg text-xs text-slate-400">
            {t2(
              'Tip: J/L are rudder — you need them to hold the centreline in a crosswind. TAB toggles the mission panel.',
              'Consejo: J/L son el timón, los necesitas para mantener el eje con viento cruzado. TAB alterna el panel de misión.',
            )}
          </p>
          <button
            onClick={start}
            disabled={!owned}
 className={`group inline-flex items-center gap-3 rounded-sm px-9 py-4 text-lg font-black tracking-wide ${
              owned
                ? 'bg-sky-400 text-slate-950  '
                : 'cursor-not-allowed bg-slate-700 text-slate-400'
            }`}
          >
            {contractMode ? t('flyMission') : t('startEngines')}
            <Ico name="right" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
