import { rankFor } from '../game/career';
import type { AwardResult, FlightSummary, Profile } from '../game/career';
import { getAircraft } from '../game/aircraft';
import { WX } from '../game/weather';
import { t, t2, useLang } from '../game/i18n';
import Ico from './Ico';

interface Props {
  profile: Profile;
  summary: FlightSummary;
  /** null on a sandbox flight: free play does not pay out */
  award: AwardResult | null;
  sandbox?: boolean;
  onAgain: () => void;
  onNewContract: () => void;
  onMenu: () => void;
  onHangar: () => void;
}

export default function Debrief({ profile, summary, award, sandbox, onAgain, onNewContract, onMenu, onHangar }: Props) {
  const lang = useLang();
  const rank = rankFor(profile.xp);
  const wx = WX[summary.weatherId] ?? WX.clear;
  const spec = getAircraft(summary.aircraft);
  const failed = summary.missionFailed && summary.missionTitleEn;

  return (
    <div className="relative min-h-screen w-full overflow-y-auto bg-slate-950 text-white">
      <div className="pointer-events-none fixed inset-0 bg-cover bg-center opacity-35" style={{ backgroundImage: "url('images/debrief.jpg')" }} />
      <div className="pointer-events-none fixed inset-0 bg-slate-950/85" />
      <div className="relative mx-auto flex min-h-screen max-w-4xl flex-col px-5 py-10 sm:px-8">
        <div className="mb-6">
          <div className="text-xs font-bold uppercase tracking-[0.25em] text-slate-400">{t('debrief')}</div>
          <h1 className={`text-4xl font-black tracking-tight ${failed ? 'text-red-400' : 'text-emerald-300'}`}>
            {summary.missionTitleEn ? (failed ? t('missionFailed') : t('missionComplete')) : t2('FLIGHT LOGGED', 'VUELO REGISTRADO')}
          </h1>
          {sandbox && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-emerald-400/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-200 ring-1 ring-emerald-300/30">
              <Ico name="tune" size={12} className="mr-1 inline -mt-0.5" />{t('sandboxOn')}
            </div>
          )}
          <p className="mt-1 text-sm text-slate-300">
            {spec.name} · <Ico name={wx.icon} size={12} className="inline -mt-0.5" /> {lang === 'es' ? wx.es : wx.en} ·{' '}
            {summary.missionTitleEn ? (lang === 'es' ? summary.missionTitleEs : summary.missionTitleEn) : t2('Free flight', 'Vuelo libre')}
          </p>
        </div>

        {award?.rankUp && (
          <div className="mb-5 rounded-md bg-amber-400/10 p-5 ring-1 ring-amber-300/40">
            <div className="flex items-center gap-1.5 text-lg font-black text-amber-200"><Ico name="medal" size={16} />{t('rankUp')}</div>
            <div className="text-2xl font-black">{lang === 'es' ? award.newRank.es : award.newRank.en}</div>
          </div>
        )}

        <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
          {!award ? (
            <div className="rounded-md bg-emerald-950/60 p-5 ring-1 ring-emerald-300/30 ">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.2em] text-emerald-300"><Ico name="tune" size={12} />{t('sandbox')}</div>
              <p className="text-sm text-emerald-100">{t('sbNoReward')}</p>
            </div>
          ) : (
          <div className="rounded-md bg-slate-900/75 p-5 ring-1 ring-white/10 ">
            <div className="mb-3 flex items-center gap-3 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-sky-300/80 after:h-px after:flex-1 after:bg-sky-300/20">{t('earned')}</div>
            <div className="mb-4 flex items-end gap-6">
              <div>
                <div className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{t('money')}</div>
                <div className="text-3xl font-black text-amber-300">+{award.money.toLocaleString()}</div>
              </div>
              <div>
                <div className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{t('xp')}</div>
                <div className="text-3xl font-black text-sky-300">+{award.xp.toLocaleString()}</div>
              </div>
              {award.multiplier > 1 && (
                <div className="rounded-sm bg-emerald-400/15 px-3 py-1.5 text-sm font-black text-emerald-200">
                  ×{award.multiplier.toFixed(1)} {t('streak')}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              {award.breakdown.map((b) => (
                <div key={b.en} className="flex items-center justify-between text-sm">
                  <span className="text-slate-300">{lang === 'es' ? b.es : b.en}</span>
                  <span className={`font-bold ${b.value < 0 ? 'text-red-300' : 'text-slate-100'}`}>
                    {b.value < 0 ? '' : '+'}
                    {b.value.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
            <div className="mt-4">
              <div className="mb-1 flex justify-between font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                <span>{lang === 'es' ? rank.def.es : rank.def.en}</span>
                <span>{rank.next ? `${profile.xp}/${rank.next.xp} XP` : 'MAX'}</span>
              </div>
              <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-amber-300" style={{ width: `${rank.progress * 100}%` }} />
              </div>
            </div>
          </div>
          )}

          <div className="space-y-5">
            <div className="rounded-md bg-slate-900/75 p-5 ring-1 ring-white/10 ">
              <div className="mb-3 flex items-center gap-3 font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-sky-300/80 after:h-px after:flex-1 after:bg-sky-300/20">{t('flightSummary')}</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                {(
                  [
                    [t('distance'), `${(summary.distance / 1000).toFixed(1)} km`],
                    [t('hours'), `${Math.floor(summary.seconds / 60)}:${String(Math.floor(summary.seconds % 60)).padStart(2, '0')}`],
                    [t('landings'), String(summary.landings)],
                    [t('traps'), String(summary.traps)],
                    [t('bestLanding'), summary.bestSink < 90 ? `${summary.bestSink.toFixed(1)} m/s` : '—'],
                    ['Max G', summary.maxG.toFixed(1)],
                    ['Max Mach', summary.maxMach.toFixed(2)],
                    ['Score', String(Math.round(summary.score))],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="flex justify-between rounded-sm bg-white/5 px-3 py-2">
                    <span className="text-slate-400">{k}</span>
                    <span className="font-bold">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {award && award.newMedals.length > 0 && (
              <div className="rounded-md bg-amber-400/10 p-5 ring-1 ring-amber-300/30">
                <div className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-amber-200">{t('newMedals')}</div>
                <div className="flex flex-wrap gap-3">
                  {award.newMedals.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 rounded-sm bg-slate-950/50 px-3 py-2 ring-1 ring-amber-300/30">
                      <Ico name={m.icon} size={22} className="text-amber-200" />
                      <div>
                        <div className="text-sm font-bold">{lang === 'es' ? m.es : m.en}</div>
                        <div className="text-[10px] text-slate-300">{lang === 'es' ? m.descEs : m.descEn}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 flex flex-wrap gap-3">
          <button
            onClick={onAgain}
            className="rounded-sm bg-sky-400 px-6 py-3 text-sm font-black text-slate-950 "
          >
            <Ico name="plane" size={15} className="mr-1.5 inline -mt-0.5" />{t('flyAgain')}
          </button>
          <button onClick={onNewContract} className="rounded-sm bg-white/10 px-6 py-3 text-sm font-bold ring-1 ring-white/15 hover:bg-white/20">
            <Ico name="refresh" size={15} className="mr-1.5 inline -mt-0.5" />{t('reroll')}
          </button>
          <button onClick={onHangar} className="rounded-sm bg-white/10 px-6 py-3 text-sm font-bold ring-1 ring-white/15 hover:bg-white/20">
            <Ico name="wrench" size={15} className="mr-1.5 inline -mt-0.5" />{t('hangar')}
          </button>
          <button onClick={onMenu} className="rounded-sm bg-white/10 px-6 py-3 text-sm font-bold ring-1 ring-white/15 hover:bg-white/20">
            <Ico name="menu" size={15} className="mr-1.5 inline -mt-0.5" />{t('toMenu')}
          </button>
        </div>
      </div>
    </div>
  );
}
