/* Headless smoke test: run the simulation without a browser and check the new systems. */
import { Sim } from './game/sim';
import type { Input } from './game/sim';
import { getAircraft } from './game/aircraft';
import { generateMission } from './game/missions';
import { emptyProfile, applyUpgrades, award, rankFor } from './game/career';
import type { FlightSummary } from './game/career';
import { Weather, WX } from './game/weather';
import { SANDBOX_DEFAULT, clampTune as clampTuneForTest } from './game/sandbox';
import { getAirport } from './game/world';

const input: Input = { pitch: 0, thr: 1, brake: false, rudder: 0 };
let failures = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (!ok) {
    failures++;
    console.log(`  ✗ ${name} ${extra}`);
  } else console.log(`  ✓ ${name} ${extra}`);
};

function fly(label: string, mode: 'open' | 'carrier', weather: 'clear' | 'storm' | 'snow' | 'fog' | 'crosswind', aircraft: 'sparrow' | 'corsair' | 'hornet', withMission: boolean, seconds: number) {
  console.log(`\n== ${label} ==`);
  const profile = { ...emptyProfile(), owned: ['sparrow', 'corsair', 'hornet'] as ('sparrow' | 'corsair' | 'hornet')[] };
  const spec = applyUpgrades(getAircraft(aircraft), profile);
  const mission = withMission ? generateMission({ mode, x: 0, seed: 42, rankIndex: 2 }) : null;
  const sim = new Sim({ mode, spec, tod: 'day', startAir: !withMission, weather: mission ? mission.weather : weather, mission });
  const dt = 1 / 60;
  let maxIce = 0;
  let maxDamage = 0;
  let sawWind = false;
  let sawPrecip = false;
  let nan = false;
  for (let i = 0; i < seconds * 60; i++) {
    // crude autopilot: hold the wings level and a gentle climb
    input.pitch = sim.grounded ? 1 : sim.vy < -2 ? 1 : sim.vy > 3 ? -1 : 0;
    if (sim.mode === 'carrier' && sim.catHeld && i > 30) sim.launch();
    sim.update(dt, input);
    maxIce = Math.max(maxIce, sim.ice);
    maxDamage = Math.max(maxDamage, sim.damage);
    if (Math.abs(sim.wind.speed) > 0.5) sawWind = true;
    if ((sim.air?.precip ?? 0) > 0.05) sawPrecip = true;
    for (const v of [sim.x, sim.y, sim.u, sim.vy, sim.p, sim.ias, sim.thrust, sim.ice, sim.damage, sim.offset, sim.crab]) {
      if (!Number.isFinite(v)) nan = true;
    }
    if (sim.mission) for (const g of sim.mission.pending.splice(0)) void g;
  }
  check('no NaN in the state vector', !nan);
  check('wind sampled', sawWind, `speed=${sim.wind.speed.toFixed(1)} m/s turb=${sim.air.turb.toFixed(2)}`);
  const s = sim.summary();
  check('summary produced', Number.isFinite(s.seconds) && s.seconds > 0, `${s.seconds.toFixed(0)} s, ${(s.distance / 1000).toFixed(1)} km, score ${Math.round(s.score)}`);
  check('weather id kept', s.weatherId === (mission ? mission.weather : weather), `${s.weatherId} vis=${(s.minVis / 1000).toFixed(1)} km`);
  if (mission) {
    const run = sim.mission!;
    check('mission advanced or failed cleanly', run.status !== 'active' || run.gatesHit > 0 || run.elapsed > 0, `status=${run.status} gates=${run.gatesHit}/${run.mission.gates.length}`);
    check('mission messages flushed', run.pending.length === 0, `pending=${run.pending.length}`);
  }
  if (weather === 'storm' || mission?.weather === 'storm') check('storm precipitated', sawPrecip, `max ice ${maxIce.toFixed(2)}`);
  check('damage stayed in range', maxDamage <= 1.2, `max dmg ${maxDamage.toFixed(2)}, max ice ${maxIce.toFixed(2)}`);
  console.log(`  · alive=${sim.alive} grounded=${sim.grounded} alt=${sim.y.toFixed(0)} m ias=${sim.ias.toFixed(0)} m/s "${sim.crashReason}"`);
  return sim;
}

// 1. open world with a contract
const s1 = fly('Open world + contract', 'open', 'clear', 'sparrow', true, 90);
check('sparrow flew forwards', s1.distance > 500, `${(s1.distance / 1000).toFixed(2)} km`);

// 2. carrier qualification
fly('Carrier ops + contract', 'carrier', 'clear', 'hornet', true, 40);

// 3. weather stress: storm, snow, fog, crosswind
fly('Storm flight', 'open', 'storm', 'corsair', false, 60);
fly('Snow flight (icing)', 'open', 'snow', 'corsair', false, 60);
fly('Fog flight', 'open', 'fog', 'sparrow', false, 30);
fly('Crosswind take-off run', 'open', 'crosswind', 'corsair', false, 30);

// 4. career maths
console.log('\n== Career ==');
const p = emptyProfile();
const summary: FlightSummary = {
  mode: 'open',
  aircraft: 'sparrow',
  weatherId: 'storm',
  missionTitleEn: 'Ferry flight',
  missionTitleEs: 'Traslado',
  missionRewardMoney: 2500,
  missionRewardXp: 300,
  missionDone: true,
  missionFailed: false,
  missionFailReason: '',
  score: 1500,
  distance: 42000,
  seconds: 900,
  landings: 2,
  traps: 0,
  cats: 0,
  crashes: 0,
  maxG: 3.2,
  maxMach: 0.4,
  bestSink: 0.9,
  night: false,
  minVis: 3000,
  maxIce: 0.1,
  maxCrosswind: 4,
  assist: false,
  events: ['perfect_landing'],
  notes: [],
};
const res = award(p, summary);
check('award pays out', res.money > 0 && res.xp > 0, `${res.money} cr, ${res.xp} XP`);
check('medals unlocked', res.newMedals.length > 0, res.newMedals.map((m) => m.id).join(','));
check('rank maths sane', rankFor(p.xp).progress >= 0 && rankFor(p.xp).progress <= 1);
check('profile persisted stats', p.stats.flights === 1 && p.stats.missions === 1);
const failing = award({ ...p }, { ...summary, missionDone: false, missionFailed: true, crashes: 1 });
check('failed contract pays less', failing.money < res.money, `${failing.money} < ${res.money}`);

void WX;

// ---------------------------------------------------------------- landing & mission pipeline
console.log('\n== Landing pipeline (crosswind) ==');
{
  const profile = { ...emptyProfile(), owned: ['sparrow', 'corsair', 'hornet'] as ('sparrow' | 'corsair' | 'hornet')[] };
  const spec = applyUpgrades(getAircraft('corsair'), profile);
  const mission = generateMission({ mode: 'open', x: 0, seed: 7, rankIndex: 0, kind: 'ferry' });
  const sim = new Sim({ mode: 'open', spec, tod: 'day', startAir: true, weather: 'crosswind', mission });
  const ap = getAirport(mission.landingAirport ?? 0);
  // set up a stable short final, as a pilot would be at 30 ft
  const gamma = -0.04;
  const alphaTrim = spec.alpha0 + (spec.emptyMass * 9.81) / (0.5 * 1.225 * (spec.vApproach * 1.05) ** 2 * spec.S) / spec.CLa;
  sim.x = ap.x - 120;
  sim.y = ap.elev + spec.gearH + 3.2;
  sim.u = spec.vApproach * 0.95;
  sim.vy = -1.4;
  sim.p = gamma + alphaTrim;
  sim.grounded = false;
  sim.airTime = 30;
  sim.gear = 1;
  sim.gearCmd = 1;
  sim.flaps = 2;
  sim.flapPos = 2;
  sim.parked = false;
  sim.assist = true;
  sim.throttle = 0.3;
  sim.thrust = 0.3;
  sim.offset = 3; // slightly off the centreline to exercise the crosswind grading
  const dt = 1 / 60;
  let touched = false;
  for (let i = 0; i < 20 * 60 && !touched; i++) {
    // the auto-trim flattens the path when the stick is centred, so keep a touch
    // of forward pressure like a pilot would on short final
    input.pitch = -0.1;
    input.thr = 0;
    input.rudder = Math.max(-1, Math.min(1, sim.offset * 0.6));
    sim.update(dt, input);
    for (const g of sim.mission?.pending.splice(0) ?? []) void g;
    if (i % 60 === 0 && i < 300) console.log(`    t=${(i / 60).toFixed(1)}s agl=${sim.agl.toFixed(1)} vs=${sim.vy.toFixed(2)} aoa=${(sim.aoa * 57.3).toFixed(1)}° off=${sim.offset.toFixed(1)} crab=${sim.crab.toFixed(1)}°`);
    if (sim.grounded) touched = true;
  }
  const s = sim.summary();
  check('touched down and survived', sim.grounded && sim.alive, `sink ${sim.sinkRate.toFixed(2)} m/s, "${sim.crashReason}"`);
  check('landing counted + graded', s.landings >= 1, `landings=${s.landings} best=${s.bestSink.toFixed(2)} m/s`);
  check('no crash damage', s.crashes === 0, sim.crashReason);
  check('contract completed on landing', sim.mission?.status === 'done', `status=${sim.mission?.status} pending=${sim.mission?.pending.length}`);
  check('centreline tracked with rudder', Math.abs(sim.offset) < 18, `offset=${sim.offset.toFixed(1)} m`);
  const p2 = emptyProfile();
  const r2 = award(p2, s);
  check('flight paid out', r2.money > 0, `${r2.money} cr / ${r2.xp} XP`);
}

// ---------------------------------------------------------------- stability check
console.log('\n== Trimmed level flight holds altitude (assist on) ==');
{
  const profile = { ...emptyProfile() };
  const spec = applyUpgrades(getAircraft('sparrow'), profile);
  const sim = new Sim({ mode: 'open', spec, tod: 'day', startAir: true, weather: 'breezy', mission: null });
  sim.autoThr = true;
  sim.atTarget = spec.vCruise;
  sim.throttle = 0.55;
  sim.thrust = 0.55;
  sim.u = spec.vCruise;
  sim.vy = 0;
  sim.p = spec.alpha0 + (spec.emptyMass * 9.81) / (0.5 * 1.225 * spec.vCruise ** 2 * spec.S) / spec.CLa;
  const y0 = sim.y;
  let minA = 9e9;
  let maxA = -9e9;
  for (let i = 0; i < 30 * 60; i++) {
    // the auto-trim flattens the path when the stick is centred, so keep a touch
    // of forward pressure like a pilot would on short final
    input.pitch = -0.1;
    input.thr = 0;
    input.rudder = 0;
    sim.update(1 / 60, input);
    minA = Math.min(minA, sim.y);
    maxA = Math.max(maxA, sim.y);
  }
  check('hands-off flight does not diverge', Math.abs(sim.y - y0) < 260, `drift ${(sim.y - y0).toFixed(1)} m (band ${(maxA - minA).toFixed(1)} m), ias ${sim.ias.toFixed(1)} m/s`);
  check('still alive and sane', sim.alive, `ias=${sim.ias.toFixed(1)} m/s, g=${sim.g.toFixed(2)}`);
}


// ---------------------------------------------------------------- sandbox
console.log('\n== Sandbox (free play) ==');
{
  const profile = emptyProfile();
  const spec = applyUpgrades(getAircraft('sparrow'), profile);
  const tune = { ...SANDBOX_DEFAULT, on: true, god: true, fuel: true, wx: 12, wz: 4, turb: 0.2, weather: 'storm' as const };
  const sim = new Sim({ mode: 'open', spec, tod: 'day', startAir: true, weather: 'storm', mission: null, sandbox: tune });
  // the tuner drives the air, not the preset
  sim.update(1 / 60, { pitch: 0, thr: 1, brake: false, rudder: 0 });
  const probe = { x: 0, y: 300, time: 40, isDay: true, mode: 'open' as const, slope: 0, smoothness: 1 };
  const plain = new Weather('clear', 'open').sample(probe);
  const tuned = new Weather('clear', 'open');
  tuned.tune = { ...tune, weather: 'clear' };
  const air = tuned.sample(probe);
  check(
    'tuner overrides the preset wind',
    Math.abs(air.wx - tune.wx) < 5 && Math.abs(plain.wx - tune.wx) > 5,
    `tuned ${air.wx.toFixed(1)} m/s vs preset ${plain.wx.toFixed(1)} (asked ${tune.wx})`,
  );
  check('tuner sets the crosswind', Math.abs(air.wz - tune.wz) < 5, `wz ${air.wz.toFixed(1)} m/s (asked ${tune.wz})`);
  check('tuner calms the turbulence', air.turb < 0.5 && sim.air.turb < 0.5, `turb ${air.turb.toFixed(2)} / ${sim.air.turb.toFixed(2)} (storm preset is 0.92)`);
  // god mode: fly it straight into the ground
  sim.y = 220;
  sim.vy = -40;
  sim.p = -0.4;
  sim.grounded = false;
  for (let i = 0; i < 25 * 60 && sim.godSaves === 0; i++) sim.update(1 / 60, { pitch: -1, thr: 1, brake: false, rudder: 0 });
  check('god mode rescues instead of dying', sim.alive && sim.godSaves > 0, `alive=${sim.alive} saves=${sim.godSaves} "${sim.crashReason}"`);
  check('infinite fuel keeps the tanks full', sim.fuel > spec.fuelMax * 0.99, `${sim.fuel.toFixed(0)}/${spec.fuelMax.toFixed(0)} kg`);
  // the tuner is clamped when it comes back from storage
  const wild = clampTuneForTest({ ...tune, wx: 999, vis: -5, tod: 'noon' as never, weather: 'nope' as never });
  check('stored tuner is sanitised', wild.wx <= 18 && wild.vis >= 200 && wild.tod === 'day' && wild.weather === 'clear', JSON.stringify(wild).slice(0, 80));
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
if (failures > 0) process.exit(1);
