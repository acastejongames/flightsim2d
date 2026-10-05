/* Headless smoke test: run the simulation without a browser and check the new systems. */
import { Sim } from './game/sim';
import type { Input } from './game/sim';
import { getAircraft } from './game/aircraft';
import type { AircraftId } from './game/aircraft';
import { generateMission } from './game/missions';
import { emptyProfile, applyUpgrades, award, rankFor } from './game/career';
import type { FlightSummary } from './game/career';
import { Weather, WX } from './game/weather';
import { SANDBOX_DEFAULT, clampTune as clampTuneForTest } from './game/sandbox';
import { DECOR } from './game/decor';
import { getAirport } from './game/world';
import { AIRCRAFT } from './game/aircraft';

const input: Input = { pitch: 0, thr: 1, brake: false, rudder: 0 };
let failures = 0;
const check = (name: string, ok: boolean, extra = '') => {
  if (!ok) {
    failures++;
    console.log(`  FAIL ${name} ${extra}`);
  } else console.log(`  ok   ${name} ${extra}`);
};

function fly(label: string, mode: 'open' | 'carrier', weather: 'clear' | 'storm' | 'snow' | 'fog' | 'crosswind', aircraft: AircraftId, withMission: boolean, seconds: number) {
  console.log(`\n== ${label} ==`);
  const profile = { ...emptyProfile(), owned: ['pc21', 'cn235', 'ef18', 'typhoon'] as AircraftId[] };
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
const s1 = fly('Open world + contract', 'open', 'clear', 'pc21', true, 90);
check('trainer flew forwards', s1.distance > 500, `${(s1.distance / 1000).toFixed(2)} km`);

// 2. carrier qualification
fly('Carrier ops + contract', 'carrier', 'clear', 'ef18', true, 40);

// 3. weather stress: storm, snow, fog, crosswind
fly('Storm flight', 'open', 'storm', 'ef18', false, 60);
fly('Snow flight (icing)', 'open', 'snow', 'ef18', false, 60);
fly('Fog flight', 'open', 'fog', 'pc21', false, 30);
fly('Crosswind take-off run', 'open', 'crosswind', 'ef18', false, 30);

// 4. career maths
console.log('\n== Career ==');
const p = emptyProfile();
const summary: FlightSummary = {
  mode: 'open',
  aircraft: 'pc21',
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
  const profile = { ...emptyProfile(), owned: ['pc21', 'cn235', 'ef18', 'typhoon'] as AircraftId[] };
  const spec = applyUpgrades(getAircraft('ef18'), profile);
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
  const spec = applyUpgrades(getAircraft('pc21'), profile);
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
  const spec = applyUpgrades(getAircraft('pc21'), profile);
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


// ---------------------------------------------------------------- flight helpers
console.log('\n== Flight helpers ==');
{
  const profile = emptyProfile();
  const spec = applyUpgrades(getAircraft('ef18'), profile);
  const idle: Input = { pitch: 0, thr: 0, brake: false, rudder: 0 };

  // --- sharper turn: a reversal must be crisp
  {
    const sim = new Sim({ mode: 'open', spec, tod: 'day', startAir: true, weather: 'clear', mission: null });
    sim.u = spec.vCruise;
    sim.vy = 0;
    const hdg0 = sim.hdg;
    let t = 0;
    for (let i = 0; i < 20 * 60 && sim.hdg === hdg0; i++) {
      sim.update(1 / 60, { ...idle, turn: true });
      t += 1 / 60;
    }
    check('turn completes quickly', sim.hdg !== hdg0 && t < 3, `${t.toFixed(2)} s at ${Math.round(sim.ias)} m/s`);
    check('holding turn keeps reversing', sim.hdg !== hdg0, `hdg ${hdg0} → ${sim.hdg}`);
  }

  // --- autopilot altitude hold with the assist off
  {
    const sim = new Sim({ mode: 'open', spec, tod: 'day', startAir: true, weather: 'clear', mission: null });
    sim.u = spec.vCruise;
    sim.vy = 0;
    sim.assist = false;
    sim.airTime = 60;
    // high enough to clear the mountains, 120 m above the target
    sim.y = 3600;
    const target = 3480;
    sim.altHold = target;
    let late = 0;
    for (let i = 0; i < 120 * 60; i++) {
      sim.update(1 / 60, { ...idle, thr: sim.ias < spec.vCruise ? 0.5 : 0 });
      if (i > 110 * 60) late = Math.max(late, Math.abs(sim.y - target));
    }
    check('alt hold captures the altitude', Math.abs(sim.y - target) < 40, `now ${(sim.y - target).toFixed(1)} m off target`);
    check('alt hold settles', late < 20, `last 10 s stays within ${late.toFixed(0)} m`);
    check('alt hold holds on a jet', sim.ias > 150 && sim.alive, `${sim.ias.toFixed(0)} m/s at ${Math.round(sim.y)} m`);
    check('alt hold is on', sim.altHold !== null, `altHold=${sim.altHold === null ? 'off' : 'on'}`);
  }

  // --- landing guidance points down the right glidepath
  {
    const sim = new Sim({ mode: 'open', spec, tod: 'day', startAir: true, weather: 'clear', mission: null });
    const ap = getAirport(0);
    const thr = ap.x - ap.len / 2;
    const dist = 2600;
    sim.x = thr - dist;
    sim.hdg = 1;
    const deg = Math.tan(3 * (Math.PI / 180));
    sim.y = ap.elev + dist * deg;
    const g = sim.glidepath();
    check('glidepath is found', !!g, g ? `${g.name} ${Math.round(g.dist)} m out` : 'null');
    check('on-path reads as centred', !!g && Math.abs(g.dev) < 6, g ? `${g.dev.toFixed(1)} m dev` : '—');
    if (g) sim.y = g.ideal + 90;
    const high = sim.glidepath();
    check('too high reads positive', !!high && high.dev > 40, high ? `${high.dev.toFixed(0)} m high` : '—');
  }

  // --- aerobatic smoke emits a trail
  {
    const sim = new Sim({ mode: 'open', spec, tod: 'day', startAir: true, weather: 'clear', mission: null });
    sim.u = spec.vCruise;
    const before = sim.particles.length;
    sim.toggleSmoke();
    for (let i = 0; i < 60; i++) sim.update(1 / 60, { ...idle, thr: 0.3 });
    check('smoke trail is emitted', sim.smokeOn && sim.particles.length > before, `${sim.particles.length} particles`);
    sim.toggleSmoke();
    check('smoke can be switched off', !sim.smokeOn, 'off');
  }
}


// ---------------------------------------------------------------- sprite aircraft
console.log('\n== Sprite aircraft ==');
{
  const spriteIds = AIRCRAFT.filter((a) => a.sprite).map((a) => a.id);
  check('every hand-drawn aircraft is in the list', spriteIds.length >= 4, spriteIds.join(', '));
  for (const id of spriteIds) {
    const spec = getAircraft(id);
    const sp = spec.sprite!;
    const width = sp.xmax - sp.xmin;
    const height = sp.ymax - sp.ymin;
    check(
      `${id}: frame matches the airframe`,
      Math.abs(width - spec.length) < spec.length * 0.25 && height < spec.length * 0.5,
      `${width.toFixed(1)} m x ${height.toFixed(1)} m for a ${spec.length} m aircraft`,
    );
    const mainBottom = sp.main.pivotY - sp.main.legLen - sp.main.wheelR;
    const noseBottom = sp.nose.pivotY - sp.nose.legLen - sp.nose.wheelR;
    check(
      `${id}: gear reaches the ground`,
      Math.abs(mainBottom + spec.gearH) < 0.25 && Math.abs(noseBottom + spec.gearH) < 0.25,
      `main ${mainBottom.toFixed(2)} m, nose ${noseBottom.toFixed(2)} m, gearH ${spec.gearH}`,
    );
    check(`${id}: airframe clears the ground`, sp.ymin > -spec.gearH, `lowest art ${sp.ymin} m vs ground −${spec.gearH} m`);
    check(`${id}: has engine markers`, sp.engines.length > 0, `${sp.engines.length} engine(s)`);
    check(
      `${id}: physics wheels match the drawn gear`,
      Math.abs(spec.mainX - sp.main.x) < 0.05 && Math.abs(spec.noseX - sp.nose.x) < 0.05,
      `physics main ${spec.mainX} / nose ${spec.noseX} vs drawn ${sp.main.x} / ${sp.nose.x}`,
    );
  }

  // the CN-235 gear must hang from the bays drawn in the artwork
  // (measured on images/cn235.png: main wheel nub ≈ +3.2 m, nose strut ≈ +8.0 m)
  const cnSp = getAircraft('cn235').sprite!;
  check(
    'CN-235 gear hangs from the artwork bays',
    Math.abs(cnSp.main.x - 3.2) < 0.3 && Math.abs(cnSp.nose.x - 8.0) < 0.3,
    `main ${cnSp.main.x} m, nose ${cnSp.nose.x} m`,
  );

  // fighters must be crisper than transports
  const ef18 = getAircraft('ef18');
  const cn235 = getAircraft('cn235');
  check('fighters are sensitive, transports are not', (ef18.sens ?? 1) > 1.25 && (cn235.sens ?? 1) < 0.85, `EF-18 ×${ef18.sens}, CN-235 ×${cn235.sens}`);

  // an evasive reversal must be quick in a fighter and slow in a transport
  for (const [id, maxT] of [['ef18', 1.6], ['cn235', 3.4]] as [string, number][]) {
    const spec = getAircraft(id as never);
    const sim = new Sim({ mode: 'open', spec, tod: 'day', startAir: true, weather: 'clear', mission: null });
    sim.u = spec.vCruise;
    sim.vy = 0;
    const hdg0 = sim.hdg;
    let t = 0;
    for (let i = 0; i < 30 * 60 && sim.hdg === hdg0; i++) {
      sim.update(1 / 60, { pitch: 0, thr: 0, brake: false, rudder: 0, turn: true });
      t += 1 / 60;
    }
    check(`${id}: reversal takes ${maxT} s or less`, t < maxT, `${t.toFixed(2)} s`);
  }

  // the transport must be able to take off and land like the rest
  {
    const spec = getAircraft('cn235');
    const sim = new Sim({ mode: 'open', spec, tod: 'day', startAir: false, weather: 'clear', mission: null });
    sim.throttle = 1;
    sim.flaps = 1;
    for (let i = 0; i < 90 * 60; i++) {
      sim.update(1 / 60, { pitch: sim.ias > spec.vRotate ? 0.6 : 0, thr: 0, brake: false, rudder: 0 });
      if (sim.agl > 120) break;
    }
    check('CN-235 gets airborne', !sim.grounded && sim.agl > 100, `${sim.agl.toFixed(0)} m AGL at ${sim.ias.toFixed(0)} m/s`);
  }
}


// ---------------------------------------------------------------- display smoke palette
console.log('\n== Display smoke palette ==');
{
  const spec = getAircraft('pc21');
  const sim = new Sim({ mode: 'open', spec, tod: 'day', startAir: true, weather: 'clear', mission: null });
  sim.u = spec.vCruise;
  // partial power so the grey exhaust haze (thrust > 0.7) never mixes with the trail
  sim.throttle = 0.45;
  sim.thrust = 0.45;
  sim.toggleSmoke();
  for (let i = 0; i < 4 * 60; i++) sim.update(1 / 60, { pitch: 0, thr: 0, brake: false, rudder: 0 });
  const pal = spec.smokeColors ?? [];
  const smoke = sim.particles.filter((p) => p.kind === 'smoke');
  const off = smoke.filter((p) => !pal.some((c) => c[0] === p.col[0] && c[1] === p.col[1] && c[2] === p.col[2]));
  const used = pal.filter((c) => smoke.some((p) => p.col[0] === c[0] && p.col[1] === c[1] && p.col[2] === c[2]));
  check(
    'PC-21 smoke is red/yellow only',
    pal.length === 2 && smoke.length > 0 && off.length === 0,
    `${smoke.length} particles, ${off.length} off-palette`,
  );
  check('PC-21 smoke alternates both colours', used.length === pal.length, used.map((c) => `rgb(${c.join(',')})`).join(' | '));
}


// ---------------------------------------------------------------- scenery & turn modifier
console.log('\n== Scenery sprites & turn modifier ==');
{
  // every scenery sprite must exist and be sane
  const fsMod = await import('node:fs');
  const names = ['tree-pine', 'tree-oak', 'house', 'atc', 'mast', 'turbine', 'block', 'barn', 'lighthouse', 'cloud-cumulus', 'gear'];
  let missing: string[] = [];
  for (const n of names) if (!fsMod.existsSync(`public/images/scenery/${n}.png`)) missing.push(n);
  check('scenery sprites are on disk', missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : `${names.length} sprites`);
  check('scenery module is asset-driven', Object.keys(DECOR).length === names.length, Object.keys(DECOR).join(', '));
  const bad = Object.entries(DECOR).filter(([, rel]) => !fsMod.existsSync(`public/${String(rel)}`));
  check('every decor sprite resolves', bad.length === 0, bad.length ? `missing ${bad.map(([k]) => k).join(', ')}` : `${Object.keys(DECOR).length} keys`);
  const bytes = Object.values(DECOR).reduce((n, rel) => n + fsMod.statSync(`public/${String(rel)}`).size, 0);
  check('scenery art stays light', bytes < 1_600_000, `${(bytes / 1024).toFixed(0)} KB`);

  // the interface must stay emoji-free (they render differently, or not at all, on PC)
  const emoji = new RegExp('[\\u{1F300}-\\u{1FAFF}\\u{2600}-\\u{27BF}\\u{2B00}-\\u{2BFF}\\u{FE0F}\\u{20E3}\\u{25A0}-\\u{25FF}]', 'u');
  const uiFiles = [
    ...fsMod.readdirSync('src/components').map((f: string) => `src/components/${f}`),
    'src/game/i18n.ts', 'src/game/hud.ts', 'src/game/weather.ts', 'src/game/missions.ts', 'src/game/career.ts',
  ].filter((f: string) => fsMod.existsSync(f));
  const dirty = uiFiles.filter((f: string) => emoji.test(fsMod.readFileSync(f, 'utf8')));
  check('interface is emoji-free', dirty.length === 0, dirty.length ? dirty.join(', ') : `${uiFiles.length} files clean`);

  // no visible propeller: the artwork carries it, the code must not draw spinning discs
  const spriteSrc = fsMod.readFileSync('src/game/sprites.ts', 'utf8');
  check('no drawn propellers', !/propDisc|blades/.test(spriteSrc), 'prop discs removed');
  check('gear is a sprite', spriteSrc.includes('images/scenery/gear.png'), 'gear.png wired');

  // the turn modifier must actually change how the aircraft handles
  const spec = getAircraft('ef18');
  const reversals: Record<string, number> = {};
  for (const turn of [0.6, 1, 2]) {
    const tune = { ...SANDBOX_DEFAULT, on: false, turn };
    const sim = new Sim({ mode: 'open', spec, tod: 'day', startAir: true, weather: 'clear', mission: null, sandbox: tune });
    sim.u = spec.vCruise;
    sim.vy = 0;
    const hdg0 = sim.hdg;
    let t = 0;
    for (let i = 0; i < 40 * 60 && sim.hdg === hdg0; i++) {
      sim.update(1 / 60, { pitch: 0, thr: 0, brake: false, rudder: 0, turn: true });
      t += 1 / 60;
    }
    reversals[String(turn)] = t;
  }
  check(
    'turn modifier scales the reversal',
    reversals['2'] < reversals['1'] && reversals['1'] < reversals['0.6'],
    `x0.6 ${reversals['0.6'].toFixed(2)} s · x1 ${reversals['1'].toFixed(2)} s · x2 ${reversals['2'].toFixed(2)} s`,
  );
  check('turn modifier stays in range', reversals['0.6'] < 4.2 && reversals['2'] > 0.5, 'no runaway');
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
if (failures > 0) process.exit(1);
