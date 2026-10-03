import { useMemo, useState } from 'react';
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
  options: { id: T; label: string; icon?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex flex-wrap gap-1 rounded-2xl bg-black/30 p-1 ring-1 ring-white/10">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`rounded-xl px-3.5 py-2 text-sm font-semibold transition ${
            value === o.id ? 'bg-sky-500 text-slate-950 shadow-lg shadow-sky-500/25' : 'text-slate-300 hover:bg-white/10'
          }`}
        >
          {o.icon && <span className="mr-1.5">{o.icon}</span>}
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
  onSpriteLab: () => void;
}

export default function Menu({ profile, onStart, onHangar, sandbox, onSandbox, onSpriteLab }: Props) {
  const lang = useLang();
  const [mode, setMode] = useState<WorldMode>(profile.mode);
  const [acId, setAcId] = useState<AircraftId>(profile.aircraft);
  const [tod, setTod] = useState<TimeOfDay>('day');
  const [startAir, setStartAir] = useState(false);
  const [weather, setWeather] = useState<WeatherId>(profile.weather);
  const [showCtl, setShowCtl] = useState(false);
  const [contractMode, setContractMode] = useState(true);
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 100000));
  const [showMedals, setShowMedals] = useState(false);

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
    if (m === 'carrier' && !spec.carrier) setAcId('hornet');
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
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-slate-950/75 via-slate-950/70 to-slate-950" />

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
            <div className="inline-flex overflow-hidden rounded-xl ring-1 ring-white/15">
              {(['en', 'es'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`px-3 py-2 text-xs font-bold uppercase transition ${
                    lang === l ? 'bg-sky-500 text-slate-950' : 'bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  {l === 'en' ? '🇬🇧 EN' : '🇪🇸 ES'}
                </button>
              ))}
            </div>
            <button
              onClick={onSpriteLab}
              title={t2('Preview the aircraft renderer at scale', 'Ver el renderizador de aviones a escala')}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold ring-1 ring-white/15 transition hover:bg-white/20"
            >
              🎨 {t2('Sprite lab', 'Sprites')}
            </button>
            <button
              onClick={() => setShowCtl((s) => !s)}
              className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold ring-1 ring-white/15 transition hover:bg-white/20"
            >
              {showCtl ? t('hideControls') : t('controls')}
            </button>
          </div>
        </header>

        {/* career strip */}
        <section className="mb-8 grid gap-3 rounded-3xl bg-slate-900/70 p-4 ring-1 ring-white/10 backdrop-blur sm:grid-cols-[1.4fr_1fr_1fr_auto] sm:items-center">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{t('rank')}</div>
            <div className="text-lg font-black text-white">
              {lang === 'es' ? rank.def.es : rank.def.en}
              <span className="ml-2 text-xs font-semibold text-slate-400">
                {rank.next ? `/ ${Math.round(rank.next.xp - profile.xp)} XP` : '· MAX'}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/10">
              <div className="h-full rounded-full bg-gradient-to-r from-amber-300 to-sky-400" style={{ width: `${rank.progress * 100}%` }} />
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{t('money')}</div>
            <div className="text-lg font-black text-amber-300">{profile.money.toLocaleString(lang === 'es' ? 'es-ES' : 'en-US')} cr</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{t('medals')}</div>
            <button onClick={() => setShowMedals((s) => !s)} className="text-lg font-black text-sky-200 hover:text-sky-100">
              🏅 {profile.medals.length}/{MEDALS.length}
            </button>
          </div>
          <button
            onClick={onHangar}
            className="rounded-2xl bg-gradient-to-r from-sky-400 to-cyan-300 px-5 py-3 text-sm font-black text-slate-950 shadow-lg shadow-sky-500/25 transition hover:scale-[1.02]"
          >
            🛠 {t('hangar')}
          </button>
        </section>

        {showMedals && (
          <section className="mb-8 grid grid-cols-3 gap-2 rounded-3xl bg-slate-900/70 p-4 ring-1 ring-white/10 sm:grid-cols-6">
            {MEDALS.map((m) => {
              const got = profile.medals.includes(m.id);
              return (
                <div
                  key={m.id}
                  title={lang === 'es' ? m.descEs : m.descEn}
                  className={`rounded-2xl p-3 text-center ring-1 ${got ? 'bg-amber-400/15 ring-amber-300/40' : 'bg-white/5 ring-white/10 opacity-50'}`}
                >
                  <div className="text-2xl">{got ? m.icon : '🔒'}</div>
                  <div className="mt-1 text-[10px] font-bold uppercase leading-tight text-slate-200">{lang === 'es' ? m.es : m.en}</div>
                </div>
              );
            })}
          </section>
        )}

        {showCtl && (
          <div className="mb-8 rounded-3xl bg-slate-900/80 p-6 ring-1 ring-white/10 backdrop-blur">
            <Controls />
          </div>
        )}

        {/* mode */}
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">{t('modeTitle')}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                { id: 'open' as WorldMode, title: t('openWorld'), icon: '🏔', text: t('openWorldText') },
                { id: 'carrier' as WorldMode, title: t('carrierOps'), icon: '⚓', text: t('carrierOpsText') },
              ]
            ).map((m) => (
              <button
                key={m.id}
                onClick={() => pickMode(m.id)}
                className={`group rounded-3xl p-5 text-left ring-1 backdrop-blur transition ${
                  mode === m.id ? 'bg-sky-500/20 ring-sky-300/60 shadow-xl shadow-sky-500/10' : 'bg-slate-900/60 ring-white/10 hover:bg-slate-900/80'
                }`}
              >
                <div className="mb-1 flex items-center gap-3">
                  <span className="text-2xl">{m.icon}</span>
                  <span className="text-xl font-bold">{m.title}</span>
                  {mode === m.id && <span className="ml-auto rounded-full bg-sky-400 px-2 py-0.5 text-[10px] font-bold text-slate-950">{t('selected')}</span>}
                </div>
                <p className="text-sm text-slate-300">{m.text}</p>
              </button>
            ))}
          </div>
        </section>

        {/* aircraft */}
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">{t('aircraftTitle')}</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
                  className={`relative overflow-hidden rounded-3xl p-4 text-left ring-1 backdrop-blur transition ${
                    sel ? 'bg-sky-500/20 ring-sky-300/60 shadow-xl shadow-sky-500/10' : 'bg-slate-900/60 ring-white/10 hover:bg-slate-900/80'
                  } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <div className="flex justify-center rounded-2xl bg-gradient-to-b from-sky-400/25 to-sky-200/5 py-2">
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
                      {sb ? `🧪 ${t('free')} · 0 cr` : `🔒 ${t('locked')} · ${frame.price.toLocaleString()} cr${rankOk ? '' : ` · ${t('needRank')} ${RANKS[frame.rank]?.[lang === 'es' ? 'es' : 'en']}`}`}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-slate-400">
            {sb
              ? `🧪 ${t2('Sandbox: every aircraft is free to fly right now.', 'Sandbox: ahora mismo puedes volar cualquier avión gratis.')}`
              : `${owned ? `✈ ${t('owned')}` : ''} ${t('buy')}: `}
            {!sb && <button onClick={onHangar} className="text-sky-300 underline">{t('hangar')}</button>}
          </p>
        </section>

        {/* contract */}
        <section className="mb-8">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">{t('todayMission')}</h2>
            <div className="inline-flex overflow-hidden rounded-xl ring-1 ring-white/15">
              <button
                onClick={() => setContractMode(true)}
                className={`px-3.5 py-2 text-xs font-bold uppercase transition ${contractMode ? 'bg-sky-500 text-slate-950' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
              >
                📋 {t('career')}
              </button>
              <button
                onClick={() => setContractMode(false)}
                className={`px-3.5 py-2 text-xs font-bold uppercase transition ${!contractMode ? 'bg-sky-500 text-slate-950' : 'bg-white/5 text-slate-300 hover:bg-white/10'}`}
              >
                🕊 {t('freeFlight')}
              </button>
            </div>
          </div>
          <div className={`rounded-3xl p-5 ring-1 backdrop-blur ${contractMode ? 'bg-slate-900/75 ring-sky-300/30' : 'bg-slate-900/50 ring-white/10 opacity-80'}`}>
            {contractMode ? (
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-2xl">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-2xl">{missionIcon(mission.kind)}</span>
                    <span className="text-xl font-bold">{lang === 'es' ? mission.titleEs : mission.titleEn}</span>
                    <span className="rounded-md bg-amber-400/20 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-200">
                      {'★'.repeat(mission.difficulty)}
                    </span>
                  </div>
                  <p className="text-sm text-slate-300">{lang === 'es' ? mission.briefEs : mission.briefEn}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-semibold">
                    {(() => {
                      const w = WEATHERS.find((x) => x.id === mission.weather) ?? WEATHERS[0];
                      return (
                        <span className="rounded-md bg-white/10 px-2 py-1 text-slate-200">
                          {w.icon} {lang === 'es' ? w.es : w.en}
                        </span>
                      );
                    })()}
                    <span className="rounded-md bg-emerald-400/15 px-2 py-1 text-emerald-200">
                      +{mission.money.toLocaleString()} cr
                    </span>
                    <span className="rounded-md bg-sky-400/15 px-2 py-1 text-sky-200">+{mission.xp} XP</span>
                    {mission.timeLimit && (
                      <span className="rounded-md bg-white/10 px-2 py-1 text-slate-200">⏱ {Math.round(mission.timeLimit / 60)} min</span>
                    )}
                    {mission.gates.length > 0 && (
                      <span className="rounded-md bg-white/10 px-2 py-1 text-slate-200">
                        🎯 {mission.gates.length} {t2('waypoints', 'balizas')}
                      </span>
                    )}
                    {mission.ceilAgl && (
                      <span className="rounded-md bg-white/10 px-2 py-1 text-slate-200">↓ {mission.ceilAgl} m</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSeed(Math.floor(Math.random() * 100000))}
                  className="rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold ring-1 ring-white/15 transition hover:bg-white/20"
                >
                  🎲 {t('reroll')}
                </button>
              </div>
            ) : (
              <p className="text-sm text-slate-300">{t('weatherHint')}</p>
            )}
          </div>
        </section>

        {/* weather + tod + start */}
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">{t('weatherTitle')}</h2>
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {WEATHERS.map((w) => {
              const active = activeWeather === w.id;
              return (
                <button
                  key={w.id}
                  disabled={contractMode}
                  onClick={() => setWeather(w.id)}
                  className={`rounded-2xl p-3 text-left ring-1 backdrop-blur transition ${
                    active ? 'bg-sky-500/20 ring-sky-300/60' : 'bg-slate-900/60 ring-white/10 hover:bg-slate-900/80'
                  } ${contractMode ? 'cursor-not-allowed opacity-45' : ''}`}
                >
                  <div className="text-xl">{w.icon}</div>
                  <div className="text-sm font-bold">{lang === 'es' ? w.es : w.en}</div>
                  <div className="text-[11px] leading-snug text-slate-400">{lang === 'es' ? w.descEs : w.descEn}</div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="mb-8 grid gap-6 sm:grid-cols-2">
          <div>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">{t('todTitle')}</h2>
            <Seg<TimeOfDay>
              value={tod}
              onChange={setTod}
              options={[
                { id: 'dawn', label: TODS.dawn.label, icon: '🌅' },
                { id: 'day', label: TODS.day.label, icon: '☀️' },
                { id: 'dusk', label: TODS.dusk.label, icon: '🌇' },
                { id: 'night', label: TODS.night.label, icon: '🌙' },
              ]}
            />
          </div>
          <div>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">{t('startTitle')}</h2>
            <Seg<'ground' | 'air'>
              value={startAir ? 'air' : 'ground'}
              onChange={(v) => setStartAir(v === 'air')}
              options={
                mode === 'carrier'
                  ? [
                      { id: 'ground', label: t('onCat'), icon: '🚀' },
                      { id: 'air', label: t('onFinal'), icon: '🎯' },
                    ]
                  : [
                      { id: 'ground', label: t('onRunway'), icon: '🛫' },
                      { id: 'air', label: t('inAir'), icon: '☁️' },
                    ]
              }
            />
          </div>
        </section>

        {/* sandbox */}
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">{t('sandboxTitle')}</h2>
          <button
            onClick={() => onSandbox({ ...sandbox, on: !sandbox.on })}
            className={`w-full rounded-3xl p-5 text-left ring-1 backdrop-blur transition ${
              sb
                ? 'bg-emerald-500/15 ring-emerald-300/50 shadow-xl shadow-emerald-500/10'
                : 'bg-slate-900/60 ring-white/10 hover:bg-slate-900/80'
            }`}
          >
            <div className="mb-1 flex flex-wrap items-center gap-3">
              <span className="text-2xl">🧪</span>
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
                <span className="rounded-lg bg-emerald-400/15 px-2 py-1">🛡 {t('sbGod')}</span>
                <span className="rounded-lg bg-emerald-400/15 px-2 py-1">⛽ {t('sbFuel')}</span>
                <span className="rounded-lg bg-emerald-400/15 px-2 py-1">✈ 0 cr</span>
                <span className="rounded-lg bg-emerald-400/15 px-2 py-1">🎚 {t('tuner')} (U)</span>
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
            className={`group inline-flex items-center gap-3 rounded-2xl px-9 py-4 text-lg font-black tracking-wide shadow-2xl transition ${
              owned
                ? 'bg-gradient-to-r from-sky-400 to-cyan-300 text-slate-950 shadow-sky-500/30 hover:scale-[1.03] active:scale-[0.99]'
                : 'cursor-not-allowed bg-slate-700 text-slate-400'
            }`}
          >
            {contractMode ? t('flyMission') : t('startEngines')}{sb ? ' 🧪' : ''}
            <span className="transition group-hover:translate-x-1">➜</span>
          </button>
        </div>
      </div>
    </div>
  );
}
