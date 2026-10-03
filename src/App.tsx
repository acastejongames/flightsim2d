import { useCallback, useEffect, useState } from 'react';
import Menu from './components/Menu';
import GameView from './components/GameView';
import Hangar from './components/Hangar';
import Debrief from './components/Debrief';
import SpriteLab from './components/SpriteLab';
import type { SimSettings } from './game/sim';
import { generateMission } from './game/missions';
import type { Mission } from './game/missions';
import { applyUpgrades, award, loadProfile, rankFor, saveProfile } from './game/career';
import type { AwardResult, FlightSummary, Profile } from './game/career';
import { getAircraft } from './game/aircraft';
import { setLang } from './game/i18n';
import { loadSandbox, saveSandbox } from './game/sandbox';
import type { SandboxTune } from './game/sandbox';

type Screen = 'menu' | 'game' | 'hangar' | 'debrief' | 'spritelab';

export default function App() {
  const [profile, setProfile] = useState<Profile>(() => loadProfile());
  const [screen, setScreen] = useState<Screen>('menu');
  const [hangarFrom, setHangarFrom] = useState<Screen>('menu');
  const [settings, setSettings] = useState<SimSettings | null>(null);
  const [mission, setMission] = useState<Mission | null>(null);
  const [summary, setSummary] = useState<FlightSummary | null>(null);
  const [awardRes, setAwardRes] = useState<AwardResult | null>(null);
  const [run, setRun] = useState(0);
  const [sandbox, setSandbox] = useState<SandboxTune>(() => loadSandbox());

  /** Persist tuner changes — the sandbox stays open the way you left it. */
  const changeSandbox = useCallback((t: SandboxTune) => {
    setSandbox(t);
    saveSandbox(t);
  }, []);

  useEffect(() => {
    setLang(profile.lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(
    (s: SimSettings, m: Mission | null) => {
      const spec = applyUpgrades(s.spec, profile);
      setSettings({ ...s, spec });
      setMission(m);
      setRun((r) => r + 1);
      setScreen('game');
    },
    [profile],
  );

  const finish = useCallback(
    (sum: FlightSummary) => {
      if (sandbox.on) {
        // free play: the career is left untouched
        setSummary(sum);
        setAwardRes(null);
        setScreen('debrief');
        return;
      }
      const p: Profile = {
        ...profile,
        owned: [...profile.owned],
        upgrades: { ...profile.upgrades },
        medals: [...profile.medals],
        stats: { ...profile.stats },
      };
      const res = award(p, sum);
      setProfile(p);
      setSummary(sum);
      setAwardRes(res);
      setScreen('debrief');
    },
    [profile, sandbox.on],
  );

  /** Start a brand new procedurally generated contract. */
  const newContract = useCallback(
    (base: SimSettings | null) => {
      const acId = profile.owned.includes(profile.aircraft) ? profile.aircraft : profile.owned[0];
      const b: SimSettings =
        base ??
        {
          mode: profile.mode,
          spec: getAircraft(profile.mode === 'carrier' && !getAircraft(acId).carrier ? 'hornet' : acId),
          tod: 'day' as const,
          startAir: false,
          weather: profile.weather,
          mission: null,
          // the tuner is always passed so the turn modifier applies; the sandbox
          // switches inside it decide whether free play, god mode and weather
          // overrides are actually in force
          sandbox: { ...sandbox },
        };
      const seed = Math.floor(Math.random() * 100000);
      const m = generateMission({ mode: b.mode, x: 0, seed, rankIndex: rankFor(profile.xp).index });
      const sb: SandboxTune = { ...sandbox, weather: m.weather };
      changeSandbox(sb);
      start({ ...b, weather: m.weather, mission: m, sandbox: sb }, m);
    },
    [profile, sandbox, changeSandbox, start],
  );

  if (screen === 'game' && settings) {
    return (
      <GameView
        key={run}
        settings={settings}
        onFinish={finish}
        onQuit={() => setScreen(summary ? 'debrief' : 'menu')}
        onSandbox={changeSandbox}
      />
    );
  }

  if (screen === 'spritelab') {
    return <SpriteLab onBack={() => setScreen('menu')} />;
  }

  if (screen === 'hangar') {
    return (
      <Hangar
        profile={profile}
        onChange={(p) => {
          setProfile(p);
          saveProfile(p);
        }}
        onBack={() => setScreen(hangarFrom)}
        onReset={(p) => setProfile(p)}
        sandbox={sandbox}
      />
    );
  }

  if (screen === 'debrief' && summary && (awardRes || sandbox.on)) {
    return (
      <Debrief
        profile={profile}
        summary={summary}
        award={awardRes}
        sandbox={sandbox.on}
        onAgain={() => {
          if (settings) start(settings, mission);
        }}
        onNewContract={() => newContract(settings)}
        onHangar={() => {
          setHangarFrom('debrief');
          setScreen('hangar');
        }}
        onMenu={() => setScreen('menu')}
      />
    );
  }

  return (
    <Menu
      profile={profile}
      onStart={start}
      onHangar={() => {
        setHangarFrom('menu');
        setScreen('hangar');
      }}
      sandbox={sandbox}
      onSandbox={changeSandbox}
      onSpriteLab={() => setScreen('spritelab')}
    />
  );
}
