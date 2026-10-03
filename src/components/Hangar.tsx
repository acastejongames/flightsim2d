import { useState } from 'react';
import { AIRCRAFT, getAircraft } from '../game/aircraft';
import type { AircraftId } from '../game/aircraft';
import { AIRFRAMES, MEDALS, UPGRADES, rankFor, upgradeCost, saveProfile, resetProfile } from '../game/career';
import type { Profile } from '../game/career';
import { t, t2, useLang } from '../game/i18n';
import type { SandboxTune } from '../game/sandbox';
import AircraftPreview from './AircraftPreview';
import Ico from './Ico';

interface Props {
  profile: Profile;
  onChange: (p: Profile) => void;
  onBack: () => void;
  onReset: (p: Profile) => void;
  sandbox: SandboxTune;
}

export default function Hangar({ profile, onChange, onBack, onReset, sandbox }: Props) {
  const lang = useLang();
  const [tab, setTab] = useState<'aircraft' | 'upgrades' | 'logbook'>('aircraft');
  const [armed, setArmed] = useState(false);
  const rank = rankFor(profile.xp);
  const sb = sandbox.on;

  const commit = (p: Profile) => {
    saveProfile(p);
    onChange({ ...p, stats: { ...p.stats } });
  };

  const buyAircraft = (id: AircraftId) => {
    const frame = AIRFRAMES[id];
    if (profile.owned.includes(id)) {
      commit({ ...profile, aircraft: id });
      return;
    }
    // sandbox: free and no rank gate
    if (!sb && (profile.money < frame.price || rank.index < frame.rank)) return;
    const price = sb ? 0 : frame.price;
    const owned = [...profile.owned, id];
    const isJet = getAircraft(id).kind === 'jet';
    const medals = isJet && !profile.medals.includes('jet') ? [...profile.medals, 'jet'] : profile.medals;
    commit({ ...profile, owned, money: profile.money - price, aircraft: id, medals });
  };

  const install = (def: (typeof UPGRADES)[number]) => {
    const lvl = profile.upgrades[def.id] ?? 0;
    if (lvl >= def.max) return;
    const cost = sb ? 0 : upgradeCost(def, lvl);
    if (!sb && profile.money < cost) return;
    commit({ ...profile, money: profile.money - cost, upgrades: { ...profile.upgrades, [def.id]: lvl + 1 } });
  };

  const cheat = (d: Partial<Profile>) => commit({ ...profile, ...d });

  const st = profile.stats;

  return (
    <div className="relative min-h-screen w-full overflow-y-auto bg-slate-950 text-white">
      <div className="pointer-events-none fixed inset-0 bg-cover bg-center opacity-40" style={{ backgroundImage: "url('images/hangar.jpg')" }} />
      <div className="pointer-events-none fixed inset-0 bg-slate-950/85" />
      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-8 sm:px-8">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-4xl font-black tracking-tight">
              <Ico name="wrench" size={26} className="mr-1.5 inline -mt-0.5"/>{t('hangar')}
              {sb && (
                <span className="ml-3 align-middle rounded-full bg-emerald-400 px-3 py-1 text-xs font-black uppercase tracking-wider text-slate-950">
                  <Ico name="tune" size={12} className="mr-1 inline -mt-0.5"/>{t('sandboxOn')}
                </span>
              )}
            </h1>
            <p className="text-sm text-slate-300">
              {lang === 'es' ? rank.def.es : rank.def.en} · <span className="text-amber-300">{profile.money.toLocaleString()} cr</span> ·{' '}
              {profile.xp.toLocaleString()} XP
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="inline-flex overflow-hidden rounded-sm ring-1 ring-white/15">
              {(
                [
                  ['aircraft', t('aircraftTitle').slice(4)],
                  ['upgrades', t('upgrades')],
                  ['logbook', t('stats')],
                ] as const
              ).map(([id, label]) => (
                <button
 key={id}
                  onClick={() => setTab(id)}
 className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-xs font-bold uppercase ${
                    tab === id ? 'bg-sky-500 text-slate-950' : 'bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
                >
                  <Ico name={id === 'aircraft' ? 'plane' : id === 'upgrades' ? 'wrench' : 'book'} size={13} />
                  {label}
                </button>
              ))}
            </div>
            <button onClick={onBack} className="rounded-sm bg-white/10 px-5 py-2.5 text-sm font-bold ring-1 ring-white/15 hover:bg-white/20">
              ← {t('back')}
            </button>
          </div>
        </header>

        {tab === 'aircraft' && (
          <div className="grid gap-4 md:grid-cols-3">
            {AIRCRAFT.map((a) => {
              const frame = AIRFRAMES[a.id];
              const owned = profile.owned.includes(a.id);
              const selected = profile.aircraft === a.id;
              const canBuy = sb || (profile.money >= frame.price && rank.index >= frame.rank);
              const spec = getAircraft(a.id);
              return (
                <div key={a.id} className={`rounded-md p-4 ring-1 ${selected ? 'bg-sky-500/15 ring-sky-300/50' : 'bg-slate-900/70 ring-white/10'}`}>
                  <div className="flex justify-center rounded-sm bg-sky-400/10 py-2">
                    <AircraftPreview spec={spec} />
                  </div>
                  <div className="mt-2 flex items-baseline justify-between">
                    <span className="text-lg font-bold">{a.name}</span>
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-sky-300">{a.role}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-300">{a.desc}</p>
                  <div className="mt-3 flex items-center justify-between">
                    {owned ? (
                      selected ? (
                        <span className="rounded-sm bg-sky-400/20 px-3 py-2 text-xs font-bold uppercase text-sky-200 ring-1 ring-sky-300/40">
                          {t('equipped')}
                        </span>
                      ) : (
                        <button
                          onClick={() => buyAircraft(a.id)}
                          className="rounded-sm bg-white/10 px-4 py-2 text-xs font-bold uppercase ring-1 ring-white/15 hover:bg-white/20"
                        >
                          {t('equip')}
                        </button>
                      )
                    ) : (
                      <button
                        onClick={() => buyAircraft(a.id)}
                        disabled={!canBuy}
 className={`rounded-sm px-4 py-2 text-xs font-bold uppercase ring-1 ${
                          canBuy
                            ? 'bg-amber-300 text-slate-950 ring-amber-200/50 '
                            : 'cursor-not-allowed bg-white/5 text-slate-400 ring-white/10'
                        }`}
                      >
                        {t('buyAircraft')} · {sb ? t('free') : `${frame.price.toLocaleString()} cr`}
                      </button>
                    )}
                    {!owned && !sb && rank.index < frame.rank && (
                      <span className="text-[10px] font-semibold uppercase text-amber-300">
                        {t('needRank')} {frame.rank}
                      </span>
                    )}
                    {!owned && sb && (
                      <span className="text-[10px] font-bold uppercase text-emerald-300"><Ico name="tune" size={11} className="mr-1 inline -mt-0.5"/>{t('free')}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'upgrades' && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {UPGRADES.map((u) => {
              const lvl = profile.upgrades[u.id] ?? 0;
              const maxed = lvl >= u.max;
              const cost = sb ? 0 : upgradeCost(u, lvl);
              const afford = sb || profile.money >= cost;
              return (
                <div key={u.id} className="rounded-md bg-slate-900/70 p-4 ring-1 ring-white/10 ">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <Ico name={u.icon} size={22} className="text-sky-200" />
                      <div>
                        <div className="font-bold leading-tight">{lang === 'es' ? u.es : u.en}</div>
                        <div className="text-[11px] text-slate-400">{lang === 'es' ? u.descEs : u.descEn}</div>
                      </div>
                    </div>
                    <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase text-slate-200">
                      {t('level')} {lvl}/{u.max}
                    </span>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    {Array.from({ length: u.max }).map((_, i) => (
                      <span key={i} className={`h-2 flex-1 rounded-full ${i < lvl ? 'bg-emerald-400' : 'bg-white/10'}`} />
                    ))}
                  </div>
                  <button
                    onClick={() => install(u)}
                    disabled={maxed || !afford}
 className={`mt-3 w-full rounded-sm px-4 py-2 text-xs font-bold uppercase ring-1 ${
                      maxed
                        ? 'cursor-default bg-emerald-400/15 text-emerald-200 ring-emerald-300/30'
                        : afford
                          ? 'bg-sky-400 text-slate-950 ring-sky-200/40 '
                          : 'cursor-not-allowed bg-white/5 text-slate-400 ring-white/10'
                    }`}
                  >
                    {maxed ? t('maxed') : `${t('install')} · ${sb ? t('free') : `${cost.toLocaleString()} cr`}`}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {tab === 'logbook' && (
          <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
            <div className="grid grid-cols-2 gap-3 rounded-md bg-slate-900/70 p-5 ring-1 ring-white/10 sm:grid-cols-3">
              {(
                [
                  [t('flights'), st.flights],
                  [t('hours'), (st.seconds / 3600).toFixed(1)],
                  [t('landings'), st.landings],
                  [t('traps'), st.traps],
                  [t('distance'), `${(st.distance / 1000).toFixed(0)} km`],
                  [t('bestLanding'), st.bestSink < 90 ? `${st.bestSink.toFixed(1)} m/s` : '—'],
                  [t('missionsDone'), st.missions],
                  [t('crashed'), st.crashes],
                  [t('streak'), `${st.streak} (${st.bestStreak})`],
                  ['Max G', st.maxG.toFixed(1)],
                  ['Max Mach', st.maxMach.toFixed(2)],
                  [t('medals'), `${profile.medals.length}/${MEDALS.length}`],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="rounded-sm bg-white/5 p-3">
                  <div className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{label}</div>
                  <div className="text-lg font-black">{value}</div>
                </div>
              ))}
              {sb && (
                <div className="col-span-2 rounded-sm bg-emerald-400/10 p-3 ring-1 ring-emerald-300/30 sm:col-span-3">
                  <div className="mb-2 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300"><Ico name="tune" size={12} />{t('cheats')}</div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => cheat({ money: profile.money + 10000 })}
                      className="rounded-sm bg-emerald-400 px-3 py-2 text-xs font-bold text-slate-950 ring-1 ring-emerald-300/40 hover:bg-emerald-300"
                    >
                      {t('addMoney')}
                    </button>
                    <button
                      onClick={() => cheat({ xp: profile.xp + 5000 })}
                      className="rounded-sm bg-sky-400 px-3 py-2 text-xs font-bold text-slate-950 ring-1 ring-sky-300/40 hover:bg-sky-300"
                    >
                      {t('addXp')}
                    </button>
                    <button
                      onClick={() =>
                        cheat({
                          owned: AIRCRAFT.map((a) => a.id),
                          money: Math.max(profile.money, 250000),
                          xp: Math.max(profile.xp, 60000),
                          upgrades: Object.fromEntries(UPGRADES.map((u) => [u.id, u.max])),
                          medals: MEDALS.map((m) => m.id),
                        })
                      }
                      className="rounded-sm bg-white/10 px-3 py-2 text-xs font-bold ring-1 ring-white/15 hover:bg-white/20"
                    >
                      <Ico name="unlock" size={13} className="mr-1.5 inline -mt-0.5"/>{t('unlockAll')}
                    </button>
                  </div>
                </div>
              )}
              <div className="col-span-2 flex items-center justify-between rounded-sm bg-white/5 p-3 sm:col-span-3">
                <span className="text-xs text-slate-400">
                  {armed ? t('confirmReset') : t('reset')}
                </span>
                <button
                  onClick={() => {
                    if (!armed) return setArmed(true);
                    onReset(resetProfile());
                    setArmed(false);
                  }}
 className={`rounded-sm px-4 py-2 text-xs font-bold uppercase ring-1 ${
                    armed ? 'bg-red-500/80 text-white ring-red-300/40' : 'bg-white/10 text-slate-300 ring-white/15 hover:bg-white/20'
                  }`}
                >
                  {armed ? t('confirmReset') : t('reset')}
                </button>
              </div>
            </div>
            <div className="rounded-md bg-slate-900/70 p-5 ring-1 ring-white/10">
              <div className="mb-3 flex items-center gap-3 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-sky-300/80 after:h-px after:flex-1 after:bg-sky-300/20">{t('medals')}</div>
              <div className="grid grid-cols-3 gap-2">
                {MEDALS.map((m) => {
                  const got = profile.medals.includes(m.id);
                  return (
                    <div
 key={m.id}
                      title={lang === 'es' ? m.descEs : m.descEn}
 className={`rounded-sm p-2 text-center ring-1 ${got ? 'bg-amber-400/15 ring-amber-300/40' : 'bg-white/5 ring-white/10 opacity-45'}`}
                    >
                      <Ico name={got ? m.icon : 'lock'} size={20} className={got ? 'text-amber-200' : ''} />
                      <div className="text-[9px] font-bold uppercase leading-tight text-slate-200">{lang === 'es' ? m.es : m.en}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <p className="mt-6 text-xs text-slate-400">
          {sb && <span className="mr-2 inline-flex items-center gap-1.5 font-bold text-emerald-300"><Ico name="tune" size={12} />{t2('Sandbox: everything is free.', 'Sandbox: todo es gratis.')}</span>}
          {t2('Upgrades apply to every aircraft you fly.', 'Las mejoras se aplican a todos los aviones que vueles.')}{' '}
          {t2('Nav computer shows wind-corrected guidance.', 'El computador de navegación muestra guiado corregido por viento.')}
        </p>
      </div>
    </div>
  );
}
