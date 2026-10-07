import type { AircraftSpec } from './aircraft';
import {
  CARRIER_LEN,
  CAT_END,
  CAT_START,
  DECK_H,
  WIRES,
  WIRE_RUNOUT,
  airportAt,
  airportsNear,
  getAirport,
  terrainHeight,
} from './world';
import type { Airport, Carrier, TimeOfDay, WorldMode } from './world';
import type { SandboxTune } from './sandbox';
import { clamp, hash, noise1, smoothstep, wrapPi } from './noise';
import { Weather } from './weather';
import type { AirState, WeatherId } from './weather';
import { MissionRun } from './missions';
import type { Mission, MissionEvent } from './missions';
import { t2 } from './i18n';
import type { FlightSummary } from './career';

const G = 9.81;
export const STEP = 1 / 120;

// ---- oleo suspension (visual): rest compression per leg, hard bottoming stop,
// and a stiff underdamped spring — touchdown thumps decay in ~2 s
export const SUSP_STATIC_N = 0.1;
export const SUSP_STATIC_M = 0.16;
const SUSP_MAX = 0.55;
const SUSP_K = 150;
const SUSP_D = 4.4;

/** one oleo bent towards its rest length: stiff, underdamped, bottoming */
function oleoStep(c: number, v: number, target: number, dt: number): [number, number] {
  const nv = v + ((target - c) * SUSP_K - v * SUSP_D) * dt;
  const nc = clamp(c + nv * dt, 0, SUSP_MAX);
  return [nc, nc <= 0 || nc >= SUSP_MAX ? 0 : nv];
}

export type SurfaceKind = 'deck' | 'runway' | 'grass' | 'sand' | 'rock' | 'snow' | 'water';
export interface Surface {
  h: number;
  kind: SurfaceKind;
  vx: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  grow: number;
  kind: 'smoke' | 'fire' | 'spark' | 'dust' | 'trail' | 'debris' | 'splash';
  col: [number, number, number];
  rot: number;
  vr: number;
}

export interface Msg {
  id: number;
  text: string;
  sub: string;
  kind: 'info' | 'good' | 'warn' | 'bad';
  t: number;
  dur: number;
}

export interface Input {
  pitch: number;
  thr: number;
  brake: boolean;
  rudder: number;
  /** held down: keeps reversing the heading as soon as a turn finishes */
  turn?: boolean;
}

export type EmergencyKind = 'engineFire' | 'fuelLeak' | 'hydraulic' | 'electrical' | 'birdStrike';

export interface Emergency {
  kind: EmergencyKind;
  t: number;
  severity: number;
  ack: boolean;
}

export interface SimSettings {
  mode: WorldMode;
  spec: AircraftSpec;
  tod: TimeOfDay;
  startAir: boolean;
  weather: WeatherId;
  mission: Mission | null;
  /** free-play tuner: everything free, everything adjustable */
  sandbox?: SandboxTune | null;
  /** phone/tablet: the coaching messages name the touch deck instead of the keys */
  touch?: boolean;
  /** random in-flight emergencies (can be disabled) */
  emergenciesEnabled?: boolean;
}

interface Aero {
  m: number;
  T: number;
  L: number;
  D: number;
  Fx: number;
  Fy: number;
  q: number;
  V: number;
  gamma: number;
  alpha: number;
}

/** HSL → 0..255 RGB, used for the aerobatic smoke colours. */
function hslToRgb(h: number, sat: number, l: number): [number, number, number] {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = sat * Math.min(l, 1 - l);
    return Math.round(255 * (l - a * Math.max(-1, Math.min(Math.min(k - 3, 9 - k), 1))));
  };
  return [f(0), f(8), f(4)];
}

function liftCoef(alpha: number, CLa: number, a0: number, aS: number): { cl: number; stall: number } {
  const clMax = CLa * (aS - a0);
  const clNeg = CLa * (-0.9 * aS - a0);
  const lin = CLa * (alpha - a0);
  const clin = clamp(lin, clNeg, clMax);
  const excess = alpha > 0 ? alpha - aS : -alpha - 0.9 * aS;
  if (excess <= 0) return { cl: clin, stall: 0 };
  const k = smoothstep(0, 0.14, excess);
  const flat = 1.15 * Math.sin(2 * alpha);
  return { cl: clin + (flat - clin) * k, stall: k };
}

/** stick shaping: gentle centre for formation and flares, full throw for supermanoeuvres */
function shapeStick(x: number): number {
  return Math.sign(x) * Math.pow(Math.abs(x), 1.35);
}

export class Sim {
  spec: AircraftSpec;
  mode: WorldMode;
  tod: TimeOfDay;
  startAir: boolean;
  /** touch deck in charge: hints point at the levers and chips, not at the keys */
  touch = false;
  carrier: Carrier | null = null;
  time = 0;
  private acc = 0;

  // kinematic state (aircraft frame: u forward horizontal speed, vy vertical speed)
  x = 0;
  y = 0;
  u = 0;
  vy = 0;
  p = 0;
  w = 0;
  hdg = 1;
  turnT = 0;
  turning = false;
  turnKind: 'air' | 'ground' = 'air';
  turnDur = 2.8;

  // controls & systems
  throttle = 0;
  thrust = 0;
  elev = 0;
  fuel = 0;
  gear = 1;
  gearCmd = 1;
  /** oleo compression per leg (m) — visual suspension, see suspPose() */
  suspN = SUSP_STATIC_N;
  suspM = SUSP_STATIC_M;
  private suspVN = 0;
  private suspVM = 0;
  /** last taxiway joint under the wheels — one index, both gears kick as one */
  private lastJoint = 0;
  private jointInit = false;
  flaps = 0;
  flapPos = 0;
  /** spoilers: persistent lift-dump + drag, air and ground */
  spoilerCmd = 0;
  spoilerPos = 0;
  hook = false;
  hookPos = 0;
  airbrake = 0;
  parked = true;
  assist = true;
  autoThr = false;
  atTarget = 0;
  trimOff = 0;
  propPhase = 0;

  // status
  grounded = true;
  belly = false;
  alive = true;
  crashReason = '';
  catHeld = false;
  catActive = false;
  private catStartX = 0;
  private catAccel = 0;
  arrested = false;
  private arrestDecel = 0;
  wire = -1;
  trapped = false;
  deckTouched = false;
  private prevHookS: number | null = null;
  airTime = 0;
  engineOut = false;
  refueling = false;
  private lowFuelSaid = false;

  // ---- weather, wind & environmental hazards
  weather: Weather;
  air: AirState;
  /** wind as the pilot sees it (m/s) */
  wind = { head: 0, cross: 0, speed: 0, gust: 0, turb: 0 };
  ice = 0; // airframe ice 0..1
  private icingSaid = 0;
  private shearSaid = 0;
  /** lateral offset from the runway centreline (m) + drift bookkeeping */
  offset = 0;
  rudder = 0;
  crab = 0; // degrees of crab required by the crosswind
  private excursionTimer = 0;
  damage = 0; // accumulated airframe damage 0..1
  private lastDamageSaid = 0;

  // ---- helpers: autopilot, aerobatic smoke
  /** altitude the autopilot is holding (m) or null when off */
  altHold: number | null = null;
  /** aerobatic smoke on/off */
  smokeOn = false;
  private smokeT = 0;

  // ---- sandbox / free play
  sandbox: SandboxTune | null = null;
  /** how many times god mode has rescued the pilot */
  godSaves = 0;

  // ---- emergencies (deshabilitables) — random in-flight failures
  emergenciesEnabled = true;
  emergency: Emergency | null = null;
  /** time since current emergency started (for HUD flashing) */
  emergencyTime = 0;
  private emergencyCooldown = 0;
  private heliHoverT = 0;
  /** true for AW139 etc — rotor physics instead of fixed-wing */
  get isHeli(): boolean {
    return this.spec.kind === 'heli';
  }

  // ---- ejection seat (universal sprite for all fighters) + parachute
  ejected = false;
  ejectState: { x: number; y: number; vx: number; vy: number; t: number; chute: boolean; landed: boolean } | null = null;
  /** gentle water ditch: sink instead of exploding (unless high energy) */
  waterDitch = false;
  private sinkT = 0;
  get isFighter(): boolean {
    return this.spec.kind === 'jet';
  }

  // ---- mission & scoring
  mission: MissionRun | null = null;
  combo = 0;
  private comboT = 0;
  events = new Set<string>();
  minVis = 99999;
  maxIce = 0;
  maxCrosswind = 0;
  stormFlight = false;
  nightFlight = false;
  notes: string[] = [];
  catLaunches = 0;
  maxG = 0;
  maxMach = 0;
  bestLandingSink = 99;
  // ---- SAR kit physics: the yellow survival pod dropped from the MPA
  sarKit: { x: number; y: number; vx: number; vy: number; alive: boolean; landed: boolean; t: number; dist?: number } | null = null;
  private sarDropCooldown = 0;
  // ---- LSO (Landing Signal Officer) grading on the carrier
  lsoGrade = '';
  lsoDetail = '';
  private lsoLastCall = 0;
  private lsoHist: { g: number; speedErr: number; line: number; t: number }[] = [];
  lsoWaveoff = false;
  /** one-shot thunder flag the audio engine reads */
  thunderPulse = 0;

  // derived (for HUD / render / audio)
  ias = 0;
  tas = 0;
  mach = 0;
  g = 1;
  aoa = 0;
  stallWarn = 0;
  overspeed = false;
  pullUp = false;
  /** GPWS mode 4: gear up, low, slow and descending — landing without wheels */
  tooLowGear = false;
  /** reactive windshear: inside a microburst outflow, low down */
  windshear = false;
  /** EGPWS caution: rising terrain ahead is inside the projected flight path */
  terrainAhead = false;
  /** distance (m) to the threatening terrain, for the HUD */
  terrainAheadDist = 0;
  /** height (m) of the threatening terrain */
  terrainAheadH = 0;
  agl = 0;
  groundH = 0;
  rho = 1.225;
  shake = 0;
  sinkRate = 0;
  hitFlash = 0;

  // stats
  flightTime = 0;
  distance = 0;
  maxAlt = 0;
  landings = 0;
  traps = 0;
  score = 0;
  lastGrade = '';

  input: Input = { pitch: 0, thr: 0, brake: false, rudder: 0 };
  particles: Particle[] = [];
  msgs: Msg[] = [];
  private msgId = 0;
  private emitAcc = 0;

  constructor(s: SimSettings) {
    this.spec = s.spec;
    this.mode = s.mode;
    this.tod = s.tod;
    this.startAir = s.startAir;
    this.touch = !!s.touch;
    this.weather = new Weather(s.weather, s.mode);
    if (s.sandbox) this.setSandbox(s.sandbox, true);
    this.emergenciesEnabled = s.emergenciesEnabled ?? true;
    if (this.god) this.emergenciesEnabled = false;
    this.air = this.weather.sample({
      x: 0,
      y: 0,
      time: 0,
      isDay: s.tod !== 'night',
      mode: s.mode,
      slope: 0,
      smoothness: 1,
    });
    if (s.mission) this.mission = new MissionRun(s.mission);
    if (this.mode === 'carrier') this.carrier = { x: 0, vx: 15 };
    this.spawn(true);
    const wxName = t2(this.weather.preset.en, this.weather.preset.es);
    this.say(
      this.mode === 'carrier' ? t2('Carrier ops', 'Operaciones en portaaviones') : t2('Open world', 'Mundo abierto'),
      'info',
      `${wxName} · ${Math.round(this.windSpeedKt())} kt ${t2('wind', 'de viento')}`,
      5,
    );
    if (this.mission) {
      this.say(t2('CONTRACT', 'CONTRATO'), 'info', t2(this.mission.mission.titleEn, this.mission.mission.titleEs), 6);
      for (const e of this.mission.pending.splice(0)) this.sayEvent(e);
    } else {
      this.say(
        this.grounded
          ? this.mode === 'carrier'
            ? this.touch
              ? t2(
                  'Push the THR lever to the top, then tap CAT to launch',
                  'Sube la palanca ACEL a tope y toca CATAP para lanzarte',
                )
              : t2(
                  'Press X (or hold →) for full throttle, then SPACE to launch from the catapult',
                  'Pulsa X (o mantén →) a tope y luego ESPACIO para lanzarte de la catapulta',
                )
            : this.touch
              ? t2('Push the THR lever, then pull the PITCH lever at rotate speed', 'Sube la palanca ACEL y tira de CABECEO a la velocidad de rotación')
              : t2('Hold → for throttle, pull ↑ at rotate speed', 'Mantén → para acelerar y tira ↑ a la velocidad de rotación')
          : t2('You have the controls', 'Tienes el control'),
        'info',
        '',
        5,
      );
    }
  }

  private windSpeedKt(): number {
    return Math.hypot(this.wind.head, this.wind.cross) * 1.944;
  }

  private sayEvent(e: MissionEvent): void {
    this.say(t2(e.en, e.es), e.kind, e.subEn ? t2(e.subEn, e.subEs ?? '') : '', 5.5);
  }

  // ---------------------------------------------------------------- helpers
  cEff(): number {
    return this.hdg * Math.cos(Math.PI * this.turnT);
  }

  say(text: string, kind: Msg['kind'] = 'info', sub = '', dur = 3.4): void {
    this.msgs.push({ id: ++this.msgId, text, sub, kind, t: 0, dur });
    if (this.msgs.length > 4) this.msgs.shift();
  }

  /** true when x is over the maritime SAR sea patch (rendered as water) */
  isSarSea(x: number): boolean {
    const sar = this.mission?.mission.sar;
    if (!sar) return false;
    if (Math.abs(x - sar.targetX) >= 5600) return false;
    // never flood a runway: the rescue is at sea, not on the airfield
    const ap = airportAt(x, 420);
    if (ap) return false;
    return true;
  }

  surfaceAt(x: number): Surface {
    if (this.carrier) {
      const s = x - this.carrier.x;
      if (s >= 0 && s <= CARRIER_LEN) return { h: DECK_H, kind: 'deck', vx: this.carrier.vx };
    }
    // SAR sea patch: even over land, the datum area is rendered and behaves as water
    if (this.isSarSea(x)) return { h: 0, kind: 'water', vx: 0 };
    const th = terrainHeight(x, this.mode);
    if (th <= 0) return { h: 0, kind: 'water', vx: 0 };
    let kind: SurfaceKind = 'grass';
    if (airportAt(x, 0)) kind = 'runway';
    else if (th < 3) kind = 'sand';
    else if (th > 1500) kind = 'snow';
    else if (th > 850) kind = 'rock';
    return { h: th, kind, vx: 0 };
  }

  slopeAt(x: number): number {
    if (this.carrier) {
      const s = x - this.carrier.x;
      if (s >= 0 && s <= CARRIER_LEN) return 0;
    }
    if (this.isSarSea(x)) return 0;
    return (terrainHeight(x + 1.5, this.mode) - terrainHeight(x - 1.5, this.mode)) / 3;
  }

  get fuelFrac(): number {
    return this.fuel / this.spec.fuelMax;
  }

  get worldVx(): number {
    return this.u * this.cEff();
  }

  // ---------------------------------------------------------------- spawning
  private resetCommon(): void {
    const s = this.spec;
    this.u = 0;
    this.vy = 0;
    this.p = 0;
    this.w = 0;
    this.turnT = 0;
    this.turning = false;
    this.hdg = 1;
    this.throttle = 0;
    this.thrust = 0;
    this.elev = 0;
    this.fuel = s.fuelMax;
    this.gear = 1;
    this.gearCmd = 1;
    this.suspN = SUSP_STATIC_N;
    this.suspM = SUSP_STATIC_M;
    this.suspVN = 0;
    this.suspVM = 0;
    this.jointInit = false;
    this.flaps = 0;
    this.flapPos = 0;
    this.spoilerCmd = 0;
    this.spoilerPos = 0;
    this.hook = false;
    this.hookPos = 0;
    this.airbrake = 0;
    this.parked = true;
    this.grounded = true;
    this.belly = false;
    this.alive = true;
    this.crashReason = '';
    this.catHeld = false;
    this.catActive = false;
    this.arrested = false;
    this.wire = -1;
    this.trapped = false;
    this.deckTouched = false;
    this.prevHookS = null;
    this.airTime = 0;
    this.lsoGrade = '';
    this.lsoDetail = '';
    this.lsoHist = [];
    this.lsoWaveoff = false;
    this.sarKit = null;
    this.sarDropCooldown = 0;
    this.engineOut = false;
    this.lowFuelSaid = false;
    this.autoThr = false;
    this.trimOff = 0;
    this.particles = [];
    this.shake = 0;
    this.stallWarn = 0;
    this.pullUp = false;
    this.tooLowGear = false;
    this.windshear = false;
    this.terrainAhead = false;
    this.terrainAheadDist = 0;
    this.terrainAheadH = 0;
    this.lastGrade = '';
    this.offset = 0;
    this.rudder = 0;
    this.ice = 0;
    this.damage = 0;
    this.crab = 0;
    this.excursionTimer = 0;
    this.emergency = null;
    this.emergencyTime = 0;
    this.emergencyCooldown = 0;
    this.heliHoverT = 0;
    this.ejected = false;
    this.ejectState = null;
    this.waterDitch = false;
    this.sinkT = 0;
  }

  private spawn(initial: boolean): void {
    const s = this.spec;
    this.resetCommon();
    if (this.mode === 'carrier' && this.carrier) {
      const c = this.carrier;
      if (initial && this.startAir) {
        const d = 3600;
        const gam = -3.5 * (Math.PI / 180);
        this.x = c.x - d;
        this.y = DECK_H + d * Math.tan(-gam) + 6;
        this.u = s.vApproach;
        this.vy = this.u * Math.sin(gam);
        {
          const mass = s.emptyMass + this.fuel;
          const q0 = 0.5 * 1.225 * this.u * this.u;
          const aTrim = s.alpha0 - 0.1 + (mass * G * Math.cos(gam)) / (q0 * s.S) / s.CLa;
          this.p = gam + aTrim;
        }
        this.grounded = false;
        this.flaps = 2;
        this.flapPos = 2;
        this.hook = true;
        this.hookPos = 1;
        this.parked = false;
        this.throttle = 0.3;
        this.thrust = 0.3;
        this.autoThr = true;
        this.atTarget = s.vApproach;
      } else {
        this.x = c.x + CAT_START;
        this.u = c.vx;
        this.y = DECK_H + s.gearH;
        this.flaps = 1;
        this.flapPos = 1;
        this.catHeld = true;
        this.parked = true;
      }
    } else {
      let ap: Airport = getAirport(0);
      if (!initial) {
        const near = airportsNear(this.x, 2);
        near.sort((a, b) => Math.abs(a.x - this.x) - Math.abs(b.x - this.x));
        ap = near[0];
      }
      if (initial && this.startAir) {
        this.x = ap.x - 3500;
        this.y = ap.elev + 900;
        this.u = s.vCruise * 0.9;
        this.p = 0.05;
        this.grounded = false;
        this.gear = s.fixedGear ? 1 : 0;
        this.gearCmd = this.gear;
        this.parked = false;
        if (s.kind === 'heli') {
          this.throttle = 0.72;
          this.thrust = 0.72;
        } else {
          this.throttle = 0.6;
          this.thrust = 0.6;
        }
      } else {
        this.x = ap.x - ap.len / 2 + 90;
        this.y = ap.elev + s.gearH;
      }
    }
    this.msgs = [];
  }

  /**
   * Effective control sensitivity: the airframe's own character (fighters are
   * sharp, transports are heavy) times the player's turn modifier.
   */
  get sensEff(): number {
    // the turn modifier is a flight-feel setting, so it applies in career
    // flights too, not only while the sandbox switch is on
    return (this.spec.sens ?? 1) * (this.sandbox?.turn ?? 1);
  }

  // ---------------------------------------------------------------- sandbox
  /** Indestructible while the sandbox god switch is on. */
  get god(): boolean {
    return !!(this.sandbox && this.sandbox.on && this.sandbox.god);
  }

  /**
   * Push a new tuner into the running flight: wind, clouds, visibility,
   * temperature, time of day and the weather preset all change live.
   */
  setSandbox(t: SandboxTune, initial = false): void {
    this.sandbox = t;
    this.weather.tune = t.on ? t : null;
    if (this.god) {
      this.emergenciesEnabled = false;
      if (this.emergency) this.clearEmergency();
    }
    if (!t.on) {
      this.weather.tune = null;
      return;
    }
    this.tod = t.tod;
    if (this.weather.id !== t.weather) this.weather.setPreset(t.weather);
    if (initial && t.fuel) this.fuel = this.spec.fuelMax;
    if (t.fuel && this.fuel < this.spec.fuelMax * 0.5) this.fuel = this.spec.fuelMax;
    this.engineOut = false;
  }

  /** Swap the weather preset mid-flight (sandbox weather buttons). */
  setWeather(id: WeatherId): void {
    this.weather.setPreset(id);
    this.say(
      t2('WEATHER CHANGED', 'CLIMA CAMBIADO'),
      'info',
      t2(this.weather.preset.en, this.weather.preset.es),
      3,
    );
  }

  respawn(): void {
    this.spawn(false);
    this.say(this.mode === 'carrier' ? 'Back on the catapult' : 'Respawned at the nearest airfield', 'info', '', 3);
  }

  // ---------------------------------------------------------------- commands
  toggleGear(): void {
    if (!this.alive) return;
    if (this.spec.fixedGear) return this.say('Fixed landing gear', 'info');
    if (this.grounded) return this.say('Gear locked while on the ground', 'warn');
    this.gearCmd = this.gearCmd > 0.5 ? 0 : 1;
    this.say(this.gearCmd > 0.5 ? 'Gear DOWN' : 'Gear UP', 'info', '', 1.6);
  }

  cycleFlaps(): void {
    if (!this.alive) return;
    this.flaps = (this.flaps + 1) % 3;
    this.say(['Flaps UP', 'Flaps TAKEOFF', 'Flaps LANDING'][this.flaps], 'info', '', 1.6);
  }

  toggleHook(): void {
    if (!this.alive) return;
    if (!this.spec.carrier) return this.say('This aircraft has no tailhook', 'info');
    this.hook = !this.hook;
    if (!this.hook && this.arrested) {
      this.arrested = false;
      this.say(
        'Hook raised — wire released',
        'info',
        this.touch ? t2('Taxi clear. Tap RESET to return to the catapult', 'Pista libre. Toca REINICIO para volver a la catapulta') : 'Taxi clear. Press R to return to the catapult',
        3,
      );
    } else this.say(this.hook ? 'Tailhook DOWN' : 'Tailhook UP', 'info', '', 1.6);
  }

  toggleAssist(): void {
    this.assist = !this.assist;
    this.say(
      this.assist ? 'Flight assist ON' : 'Flight assist OFF',
      'info',
      this.assist ? 'Auto-trim holds your flight path' : 'Manual trim: Q / E. Expect phugoid oscillations.',
      2.6,
    );
  }

  toggleAutoThrottle(): void {
    if (this.grounded) return this.say('Autothrottle available in flight', 'info');
    this.autoThr = !this.autoThr;
    if (this.autoThr) this.atTarget = Math.round(this.ias / 2) * 2;
    this.say(
      this.autoThr ? `Autothrottle ON — ${Math.round(this.atTarget * 1.944)} kt` : 'Autothrottle OFF',
      'info',
      this.autoThr ? (this.touch ? t2('the lever adjusts speed', 'la palanca ajusta la velocidad') : '← → adjust speed') : '',
      2.2,
    );
  }

  trim(d: number): void {
    this.trimOff = clamp(this.trimOff + d * 0.012, -0.25, 0.25);
  }

  startTurn(): void {
    this.tryTurn(false);
  }

  /**
   * Begin a heading reversal. `silent` is used when the key is simply being held
   * down, so we do not spam the message log with reasons we cannot turn yet.
   */
  private tryTurn(silent: boolean): void {
    if (!this.alive || this.turning) return;
    if (this.grounded) {
      if (this.carrier && this.surfaceAt(this.x).kind === 'deck') return this.say('Cannot turn around on the flight deck', 'warn');
      if (Math.abs(this.u) > 3) return this.say('Stop before turning around', 'warn');
      this.turning = true;
      this.turnKind = 'ground';
      this.turnT = 0;
      this.turnDur = 1.0;
      this.u = 0;
      return;
    }
    if (this.ias < 1.25 * this.spec.vs) {
      if (!silent) this.say('Too slow to turn — add speed', 'warn');
      return;
    }
    if (Math.cos(this.p) < 0.5) {
      if (!silent) this.say('Level out before turning', 'warn');
      return;
    }
    this.turning = true;
    this.turnKind = 'air';
    this.turnT = 0;
    // a reversal is much crisper than it used to be, and fast jets still carve
    // wider arcs than slow ones
    // fighters snap through a reversal, heavy transports wallow through it;
    // the speed term is gentle so the turn modifier keeps a useful range
    this.turnDur = clamp((2.6 - this.ias * 0.004) / this.sensEff, 0.42, 3.6);
  }

  /** Autopilot: capture the current altitude and hold it. */
  toggleAltHold(): void {
    if (this.altHold !== null) {
      this.altHold = null;
      this.say(t2('ALT HOLD OFF', 'ALTITUD FIJADA OFF'), 'info', '', 2);
      return;
    }
    if (this.grounded) return this.say(t2('Take off first', 'Despega primero'), 'warn');
    this.altHold = this.y;
    this.say(t2('ALT HOLD', 'ALTITUD FIJADA'), 'good', t2(`${Math.round(this.agl)} m AGL`, `${Math.round(this.agl)} m AGL`), 2.5);
  }

  /** Spoilers up/down — persistent toggle, drag + lift dump in every regime. */
  toggleSpoilers(): void {
    this.spoilerCmd = this.spoilerCmd > 0.5 ? 0 : 1;
    this.say(
      this.spoilerCmd > 0.5 ? t2('SPOILERS UP', 'SPOILERS FUERA') : t2('SPOILERS DOWN', 'SPOILERS DENTRO'),
      'info',
      this.touch ? t2('the SPLR chip toggles them', 'el botón SPLR los mueve') : t2('C toggles the spoilers', 'C saca y mete los spoilers'),
      2.5,
    );
  }

  /** Aerobatic smoke trail on/off — display smoke is PC-21 equipment only. */
  toggleSmoke(): void {
    if (!this.spec.displaySmoke) {
      this.say(
        t2('NO SMOKE EQUIPPED', 'SIN HUMO'),
        'info',
        t2('Only the PC-21 carries display smoke', 'Solo el PC-21 lleva humo de exhibición'),
        2.5,
      );
      return;
    }
    this.smokeOn = !this.smokeOn;
    this.say(
      this.smokeOn ? t2('SMOKE ON', 'HUMO ON') : t2('SMOKE OFF', 'HUMO OFF'),
      'info',
      this.touch ? t2('the SMOKE chip toggles it', 'el botón HUMO lo activa') : t2('V toggles the aerobatic smoke', 'V activa y desactiva el humo acrobático'),
      2.5,
    );
  }

  /** Emergencies master switch (deshabilitables) */
  toggleEmergencies(): void {
    this.emergenciesEnabled = !this.emergenciesEnabled;
    if (!this.emergenciesEnabled && this.emergency) {
      this.clearEmergency(true);
      this.say(t2('EMERGENCIES OFF', 'EMERGENCIAS OFF'), 'info', t2('Current emergency cleared', 'Emergencia actual eliminada'), 2.5);
    } else {
      this.say(
        this.emergenciesEnabled ? t2('EMERGENCIES ON', 'EMERGENCIAS ON') : t2('EMERGENCIES OFF', 'EMERGENCIAS OFF'),
        'info',
        this.emergenciesEnabled ? t2('Random failures enabled', 'Fallos aleatorios activados') : t2('Random failures disabled', 'Fallos aleatorios desactivados'),
        2.5,
      );
    }
  }

  /** Player acknowledges / runs checklist: try to mitigate current emergency (E key) */
  ackEmergency(): void {
    if (!this.emergency) {
      this.say(t2('NO EMERGENCY', 'SIN EMERGENCIA'), 'info', '', 1.6);
      return;
    }
    const e = this.emergency;
    if (e.ack) {
      this.say(t2('CHECKLIST DONE', 'LISTA HECHA'), 'info', t2('Land as soon as practical', 'Aterriza en cuanto puedas'), 2);
      return;
    }
    e.ack = true;
    // mitigate per type: fire needs idle, hydraulic needs gear, etc — but ack always helps a bit
    if (e.kind === 'engineFire') {
      if (this.throttle < 0.25) {
        this.say(t2('FIRE — THROTTLE IDLE, EXTINGUISHED', 'INCENDIO — MOTOR AL RALENTÍ, EXTINGUIDO'), 'good', t2('Keep it cool and land', 'Mantén baja potencia y aterriza'), 4);
        this.emergency = null;
        this.damage = Math.min(1, this.damage + 0.08);
      } else {
        this.say(t2('FIRE ACK — RETARD THROTTLE!', 'INCENDIO CONFIRMADO — ¡REDUCE POTENCIA!'), 'warn', t2('Pull throttle to idle and press E again', 'Pon el motor al ralentí y pulsa E otra vez'), 4);
        e.ack = false;
        this.damage += 0.06;
      }
      return;
    }
    if (e.kind === 'fuelLeak') {
      this.say(t2('FUEL LEAK ACK — REDUCE POWER, LAND', 'FUGA CONFIRMADA — REDUCE Y ATERRIZA'), 'warn', t2('Find the nearest runway', 'Busca la pista más cercana'), 4);
    } else if (e.kind === 'hydraulic') {
      this.say(t2('HYDRAULIC ACK — GEAR MAY JAM', 'HIDRÁULICO CONFIRMADO — TREN SOSPECHOSO'), 'warn', t2('Use emergency extension (G) and brace', 'Intenta bajar el tren (G) y prepárate'), 4);
      // try to jam gear half-way 30% chance
      if (this.gearCmd > 0.5 && Math.random() < 0.35) this.gearCmd = 0.5;
      this.damage += 0.03;
    } else if (e.kind === 'electrical') {
      this.say(t2('ELEC ACK — SHED LOAD', 'ELÉCTRICO CONFIRMADO — ALIGERA CARGA'), 'info', t2('Some instruments may flicker', 'Algunos instrumentos pueden fallar'), 3);
      this.damage += 0.02;
    } else if (e.kind === 'birdStrike') {
      this.say(t2('BIRD STRIKE ACK — CHECK ENGINES', 'IMPACTO AVE CONFIRMADO — REVISA MOTOR'), 'warn', t2('Vibration — land soon', 'Vibración: aterriza pronto'), 3);
    }
    // after ack, emergency stays as handled but HUD clears flashing after 4s; we keep for scoring until landing
    e.ack = true;
  }

  private clearEmergency(showMsg = false): void {
    if (!this.emergency) return;
    if (showMsg) this.say(t2('EMERGENCY CLEARED', 'EMERGENCIA RESUELTA'), 'good', '', 2);
    this.emergency = null;
    this.emergencyTime = 0;
    this.emergencyCooldown = 12;
  }

  triggerEmergency(): void {
    const kinds: EmergencyKind[] = ['engineFire', 'fuelLeak', 'hydraulic', 'electrical', 'birdStrike'];
    let kind: EmergencyKind = kinds[Math.floor(Math.random() * kinds.length)];
    // heli has slightly higher bird strike? no, random
    // avoid duplicate
    if (this.emergency) return;
    // bias bird strike when low and fast
    if (this.agl < 300 && this.ias > 45 && Math.random() < 0.18) kind = 'birdStrike';
    const sev = 0.5 + Math.random() * 0.5;
    this.emergency = { kind, t: 0, severity: sev, ack: false };
    this.emergencyTime = 0;
    this.emergencyCooldown = 0;
    const lang = this.touch;
    let title = '';
    let sub = '';
    let k: Msg['kind'] = 'warn';
    switch (kind) {
      case 'engineFire':
        title = t2('ENGINE FIRE!', '¡FUEGO MOTOR!');
        sub = t2('Throttle idle + E to extinguish', 'Motor al ralentí + E para extinguir');
        k = 'bad';
        this.shake = 0.7;
        break;
      case 'fuelLeak':
        title = t2('FUEL LEAK!', '¡FUGA DE COMBUSTIBLE!');
        sub = t2('Fuel dropping — land now', 'Combustible cayendo: aterriza ya');
        k = 'warn';
        break;
      case 'hydraulic':
        title = t2('HYD FAILURE!', '¡FALLO HIDRÁULICO!');
        sub = t2('Controls degraded — gear may jam', 'Mandos degradados: tren puede fallar');
        k = 'warn';
        break;
      case 'electrical':
        title = t2('ELEC FAILURE!', '¡FALLO ELÉCTRICO!');
        sub = t2('Avionics flicker — shed load', 'Aviónica inestable: aligera carga');
        k = 'warn';
        break;
      case 'birdStrike':
        title = t2('BIRD STRIKE!', '¡IMPACTO DE AVE!');
        sub = t2('Check engines and airframe', 'Revisa motor y célula');
        k = 'bad';
        this.damage += 0.18 + sev * 0.12;
        this.shake = 0.9;
        this.hitFlash = 0.4;
        if (Math.random() < 0.32) { this.engineOut = true; sub = t2('ENGINE DAMAGED!', '¡MOTOR DAÑADO!'); }
        for (let i = 0; i < 12; i++) this.addParticle('debris', this.x, this.y, this.worldVx*0.2 + (Math.random()-0.5)*12, Math.random()*6, 1.2, 0.6, 0, [200,180,160]);
        break;
    }
    void lang;
    this.say(title, k, sub, 5);
  }

  /** Ejection seat — universal sprite for all fighters (cazas). Pulsa Ctrl+E / Shift+E o el botón EJECT. */
  eject(): void {
    if (!this.isFighter) {
      this.say(t2('NO EJECTION SEAT', 'SIN ASIENTO EYECTABLE'), 'info', t2('Only fighters have ejection seats', 'Solo los cazas tienen asiento eyectable'), 2.5);
      return;
    }
    if (this.ejected) {
      this.say(t2('ALREADY EJECTED', 'YA EYECTADO'), 'info', '', 1.5);
      return;
    }
    // allow bail-out from a gently ditched hull that is still sinking
    if (!this.alive && !this.waterDitch) {
      this.say(t2('CANNOT EJECT', 'NO SE PUEDE EYECTAR'), 'warn', '', 1.5);
      return;
    }
    // if already on the ground and not moving, still allow 0-0 ejection
    if (!this.alive && this.waterDitch && this.sinkT > 9) {
      this.say(t2('TOO DEEP TO EJECT', 'DEMASIADO PROFUNDO PARA EYECTAR'), 'warn', '', 1.5);
      return;
    }
    this.ejected = true;
    this.events.add('ejected');
    this.notes.push('ejected');
    const vx = this.worldVx;
    // rocket kicks seat ~18 m/s up relative to aircraft, plus a bit forward
    const kickUp = 18 + Math.random() * 2;
    const forward = vx * 0.12;
    this.ejectState = {
      x: this.x,
      y: this.y + 1.2,
      vx: vx * 0.55 + forward,
      vy: this.vy + kickUp,
      t: 0,
      chute: false,
      landed: false,
    };
    this.say(t2('EJECT! EJECT! EJECT!', '¡EYECCIÓN! ¡EYECCIÓN!'), 'bad', t2('Canopy jettisoned — good chute', 'Cúpula fuera — paracaídas abierto'), 4);
    this.shake = 1;
    this.hitFlash = 0.6;
    // seat rocket plume + canopy debris
    for (let i = 0; i < 16; i++) this.addParticle('fire', this.x, this.y + 0.8, vx * 0.18 + (Math.random() - 0.5) * 6, 5 + Math.random() * 9, 0.35, 1.4, 1.2, [255, 190 + Math.random() * 60, 60]);
    for (let i = 0; i < 10; i++) this.addParticle('debris', this.x + (Math.random() - 0.5) * 1.5, this.y + 0.5, vx * 0.25 + (Math.random() - 0.5) * 8, 3 + Math.random() * 7, 1.1, 0.55, 0, [210, 215, 225]);
    for (let i = 0; i < 8; i++) this.addParticle('smoke', this.x, this.y + 0.6, (Math.random() - 0.5) * 4, 2 + Math.random() * 4, 1.4, 0.9, 1.4, [130, 135, 145]);
    // the jet is now pilotless — cut throttle, aircraft will become a wreck on impact (no instant explosion)
  }

  private ejectTick(dt: number): void {
    const e = this.ejectState;
    if (!e || e.landed) return;
    e.t += dt;
    // opening shock: after ~0.9 s or when apex passed and vertical speed turns negative
    if (!e.chute && (e.t > 0.9 || e.vy < 0)) {
      e.chute = true;
      this.say(t2('CHUTE OPEN', 'PARACAÍDAS ABIERTO'), 'good', t2('Steer with rudder', 'Dirige con el timón'), 2);
      for (let i = 0; i < 10; i++) this.addParticle('smoke', e.x, e.y + 2, (Math.random() - 0.5) * 2, 0.5 + Math.random() * 1, 0.8, 0.6, 0.5, [245, 245, 255]);
    }
    // physics: free-fall then parachute-retarded
    if (!e.chute) {
      e.vy -= 9.81 * dt;
      e.vx *= 1 - 0.04 * dt;
    } else {
      // parachute: terminal ~5.2 m/s, gentle horizontal drift
      const drag = 2.2;
      e.vy += (-9.81 - drag * e.vy) * dt;
      // allow slight rudder steer when under chute
      const steer = clamp(this.input.rudder * 2.5, -2.5, 2.5);
      e.vx += steer * dt * 1.2;
      e.vx *= 1 - 0.12 * dt;
      // parachute sway
      e.x += Math.sin(e.t * 1.7) * 0.02;
    }
    e.x += e.vx * dt;
    e.y += e.vy * dt;
    const surf = this.surfaceAt(e.x);
    const isWater = surf.kind === 'water';
    const gnd = surf.h + 0.9; // pilot height above ground when landed
    if (e.y <= gnd) {
      e.y = gnd;
      e.landed = true;
      e.vx *= 0.2;
      e.vy = 0;
      if (isWater) {
        for (let i = 0; i < 22; i++) this.addParticle('splash', e.x, surf.h, (Math.random() - 0.5) * 10, 2 + Math.random() * 6, 0.9, 0.7, 0.8, [210, 235, 255]);
        this.say(t2('SPLASH — IN WATER', '¡AL AGUA!'), 'warn', t2('Pilot in water — awaiting rescue', 'Piloto en el agua — esperando rescate'), 4);
      } else {
        for (let i = 0; i < 12; i++) this.addParticle('dust', e.x, gnd + 0.2, (Math.random() - 0.5) * 4, 1 + Math.random() * 2, 0.9, 0.6, 0.8, [170, 150, 120]);
        this.say(t2('PILOT ON GROUND', 'PILOTO EN TIERRA'), 'good', t2('Pilot safe — chute collapsed', 'Piloto a salvo — campana plegada'), 3);
      }
      this.events.add(e.chute ? 'chute_landing' : 'hard_landing_chute');
    }
  }

  private emergencyTick(dt: number): void {
    this.emergencyCooldown = Math.max(0, this.emergencyCooldown - dt);
    if (this.emergency) {
      this.emergency.t += dt;
      this.emergencyTime += dt;
      const e = this.emergency;
      // apply ongoing effects
      if (e.kind === 'engineFire') {
        this.damage += 0.012 * dt * e.severity;
        this.shake = Math.max(this.shake, 0.25 + Math.sin(this.time*18)*0.12);
        // fire particles
        if (Math.random() < 0.28) {
          const wx = this.x + (this.spec.length*0.1 + Math.random()*2) * this.cEff();
          this.addParticle('fire', wx, this.y, this.worldVx*0.15 + (Math.random()-0.5)*3, 2+Math.random()*5, 0.7, 1.2, 2, [255, 90+Math.random()*80, 30]);
          this.addParticle('smoke', wx, this.y, (Math.random()-0.5)*4, 3+Math.random()*4, 2.2, 1.4, 2, [30,30,34]);
        }
        // if not acked and throttle high, damage faster
        if (!e.ack && this.throttle > 0.4) this.damage += 0.018*dt;
        if (e.ack && this.throttle < 0.25) {
          // cooling over time clears fire after 6 sec idle
          if (e.t > 6) { this.clearEmergency(); this.say(t2('FIRE OUT', 'FUEGO APAGADO'), 'good', t2('Land and inspect', 'Aterriza y revisa'), 3); }
        }
        if (this.fuel > 0 && Math.random() < 0.008*dt*60) this.fuel = Math.max(0, this.fuel - 1.2*dt);
      } else if (e.kind === 'fuelLeak') {
        const leak = 0.85 * e.severity; // kg/s
        if (this.fuel > 0) this.fuel = Math.max(0, this.fuel - leak*dt);
        if (this.fuel <= 0 && !this.engineOut) { this.engineOut = true; this.say(t2('FUEL EXHAUSTED — LEAK', 'SIN COMBUSTIBLE: FUGA'), 'bad','',3); }
        if (Math.random() < 0.05) this.addParticle('smoke', this.x, this.y-0.3, (Math.random()-0.5)*2, 0.5, 0.9, 0.4, 1, [200,200,220]);
      } else if (e.kind === 'hydraulic') {
        // degrade brakes and pitch authority slightly
        if (this.grounded && Math.abs(this.u) > 5 && this.input.brake) {
          // braking 40% weaker
        }
      } else if (e.kind === 'electrical') {
        if (Math.random() < 0.02) this.hitFlash = Math.max(this.hitFlash, 0.07);
      } else if (e.kind === 'birdStrike') {
        if (e.t > 8 && this.damage < 1) {
          // strike effects linger but no ongoing drain
        }
      }
      // auto-clear on successful landing after ack
      if (this.grounded && Math.abs(this.u) < 2 && e.ack && e.t > 4) {
        const was = e.kind;
        this.clearEmergency();
        this.events.add('emergency');
        this.notes.push(`emergency:${was}`);
        this.say(t2('EMERGENCY HANDLED', 'EMERGENCIA GESTIONADA'), 'good', t2('Aircraft secured', 'Avión asegurado'), 3);
      }
      // if not landed in 90 sec and fire, risk crash
      if (e.kind === 'engineFire' && e.t > 55 && !this.grounded) {
        this.damage += 0.015*dt;
        if (this.damage >= 1) this.crash('Engine fire — airframe lost', false);
      }
      return;
    }
    // no active emergency — roll for new one
    if (!this.emergenciesEnabled || this.god) return;
    if (this.grounded || !this.alive) return;
    if (this.airTime < 9 || this.time < 22) return;
    if (this.emergencyCooldown > 0) return;
    // rate: ~0.9 per 1800 sec = 0.0005 per sec
    const rate = this.isHeli ? 0.00065 : 0.0005; // heli a bit more
    if (Math.random() < dt * rate) this.triggerEmergency();
  }

  /** Drop the SAR survival kit (D key / HUD button). */
  dropKit(): void {
    if (!this.alive) return;
    if (!this.mission || this.mission.mission.kind !== 'sar') {
      this.say(t2('NO SAR CONTRACT', 'SIN CONTRATO SAR'), 'info', t2('Take a SAR contract to use the kit', 'Acepta un contrato SAR para usar el kit'), 2.5);
      return;
    }
    if (!this.mission.sarSpotted) {
      this.say(t2('FIND THE RAFT FIRST', 'PRIMERO LOCALIZA LA BALSA'), 'warn', t2('Overfly the raft below 320 m to spot it', 'Sobrevuela la balsa por debajo de 320 m'), 3);
      return;
    }
    if (this.mission.sarDropDone) {
      this.say(t2('KIT ALREADY DROPPED', 'KIT YA LANZADO'), 'info', t2('Return to base and land', 'Vuelve a la base y aterriza'), 2.5);
      return;
    }
    if (this.sarKit && this.sarKit.alive && !this.sarKit.landed) {
      this.say(t2('KIT IN THE AIR', 'KIT EN EL AIRE'), 'info', '', 1.5);
      return;
    }
    if (this.sarDropCooldown > 0) return;
    if (this.grounded) {
      this.say(t2('DROP IN FLIGHT ONLY', 'SOLO EN VUELO'), 'warn', '', 2);
      return;
    }
    // spawn just below the belly
    const vx = this.worldVx;
    this.sarKit = { x: this.x, y: this.y - 1.2, vx, vy: this.vy - 1.5, alive: true, landed: false, t: 0 };
    this.sarDropCooldown = 1.2;
    this.say(t2('KIT AWAY', '¡KIT FUERA!'), 'good', t2('Watch the splash', 'Vigila el amerizaje'), 2.2);
    // tiny pod tumbling
    for (let i = 0; i < 6; i++) this.addParticle('debris', this.x, this.y - 1, vx * 0.3 + (Math.random() - 0.5) * 4, this.vy * 0.5, 1.2, 0.4, 0, [240, 210, 60]);
  }

  private sarKitTick(dt: number): void {
    this.sarDropCooldown = Math.max(0, this.sarDropCooldown - dt);
    if (!this.sarKit || !this.sarKit.alive) return;
    const k = this.sarKit;
    k.t += dt;
    if (!k.landed) {
      // parachute-retarded fall: terminal ~7 m/s
      k.vy += (-9.81 - 1.4 * k.vy) * dt;
      k.vx *= 1 - 0.35 * dt;
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      const surf = this.surfaceAt(k.x);
      const hitY = surf.h + 0.6;
      if (k.y <= hitY) {
        k.y = hitY;
        k.landed = true;
        // splash
        for (let i = 0; i < 18; i++) this.addParticle('splash', k.x, hitY, (Math.random() - 0.5) * 18, 2 + Math.random() * 10, 1.1, 0.9, 1, [240, 240, 255]);
        for (let i = 0; i < 10; i++) this.addParticle('smoke', k.x, hitY + 0.4, (Math.random() - 0.5) * 6, 1 + Math.random() * 3, 1.6, 0.7, 1.5, [240, 210, 60]);
        const sar = this.mission?.mission.sar;
        if (sar && this.mission) {
          const dist = Math.abs(k.x - sar.targetX);
          k.dist = dist;
          this.mission.onDrop(dist);
          this.sayEvent(this.mission.pending[this.mission.pending.length - 1]);
          // keep kit visible on water for a while, then fade
        } else {
          k.alive = false;
        }
      } else if (k.t > 18) {
        k.alive = false;
      }
    } else {
      // bob on water
      k.y = this.surfaceAt(k.x).h + 0.6 + Math.sin(this.time * 1.8) * 0.12;
      if (k.t > 22) k.alive = false;
    }
  }

  /** LSO calls during the carrier approach — glide, speed, lineup, waveoff */
  private lsoTick(_dt: number): void {
    if (!this.carrier || !this.alive || this.grounded || this.mission?.mission.kind !== 'carrierQual') return;
    if (this.gear < 0.9 || this.hookPos < 0.9) return;
    const err = this.olsError();
    if (err === null) return;
    const dist = (this.carrier.x + 82) - (this.x - this.spec.hookX * this.cEff());
    if (dist < 200 || dist > 4300) return;
    const now = this.time;
    if (now - this.lsoLastCall < 2.2) return;
    const speedErr = this.ias * 1.944 - this.spec.vApproach * 1.944;
    const line = Math.abs(this.offset);
    // keep a short history for the final grade
    this.lsoHist.push({ g: err, speedErr, line, t: now });
    if (this.lsoHist.length > 18) this.lsoHist.shift();
    // waveoff logic: very low / very high / very lined up at short range
    const waveLow = err < -1.4 && dist < 1100;
    const waveHigh = err > 1.7 && dist < 900;
    const waveLine = line > 12 && dist < 900;
    if (waveLow || waveHigh || waveLine) {
      this.lsoWaveoff = true;
      this.lsoLastCall = now;
      const reason = waveLow ? (this.touch ? t2('WAVEOFF — LOW!', '¡FRUSTRADA: BAJO!') : 'WAVEOFF, LOW!') : waveHigh ? 'WAVEOFF, HIGH!' : 'WAVEOFF, LINEUP!';
      this.say(reason, 'bad', t2('Full power — go around', 'Motor a tope: frustrada'), 3);
      return;
    }
    // routine calls
    if (Math.abs(err) > 1.0) {
      this.lsoLastCall = now;
      this.say(err > 0 ? t2('YOU ARE HIGH', 'VAS ALTO') : t2('YOU ARE LOW', 'VAS BAJO'), 'warn', err > 0 ? t2('Ease down', 'Corrige abajo') : t2('Power!', '¡Motor!'), 2);
      return;
    }
    if (Math.abs(speedErr) > 12) {
      this.lsoLastCall = now;
      this.say(speedErr > 0 ? t2('YOU ARE FAST', 'VAS RÁPIDO') : t2('YOU ARE SLOW', 'VAS LENTO'), 'warn', '', 2);
      return;
    }
    if (line > 8) {
      this.lsoLastCall = now;
      this.say(line > 0 ? t2('LINEUP LEFT', 'ALINÉATE A LA DERECHA') : t2('LINEUP RIGHT', 'ALINÉATE A LA IZQUIERDA'), 'warn', '', 2);
      return;
    }
  }

  launch(): void {
    if (!this.alive) return;
    if (!this.carrier) return;
    if (this.trapped || (this.arrested && this.u - this.carrier.vx * this.hdg < 0.5)) return this.respawn();
    if (!this.catHeld) return this.say(this.touch ? t2('Not on the catapult — tap RESET', 'No estás en la catapulta: toca REINICIO') : 'Not on the catapult — press R to reposition', 'info');
    if (this.throttle < 0.85)
      return this.say(
        'Set throttle to FULL before launch',
        'warn',
        this.touch ? t2('push the THR lever to the top', 'sube la palanca ACEL a tope') : 'Hold → until the bar is full',
      );
    this.catHeld = false;
    this.catActive = true;
    this.parked = false;
    this.catStartX = this.x;
    const sNow = this.x - this.carrier.x;
    this.catAccel = (this.spec.catSpeed * this.spec.catSpeed) / (2 * (CAT_END - sNow));
    this.say('CATAPULT!', 'good', '', 1.5);
    this.shake = 0.6;
  }

  // ---------------------------------------------------------------- update
  update(dt: number, input: Input): void {
    this.input = input;
    dt = Math.min(dt, 0.05);
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP && n < 8) {
      this.step(STEP);
      this.acc -= STEP;
      n++;
    }
    if (n >= 8) this.acc = 0;
    this.frameUpdate(dt);
  }

  private frameUpdate(dt: number): void {
    const s = this.spec;
    this.updateEnvironment(dt);
    this.sarKitTick(dt);
    this.lsoTick(dt);
    this.emergencyTick(dt);
    this.ejectTick(dt);
    // heli hover timer for medal (low & slow & level)
    if (this.isHeli && this.alive && !this.grounded && Math.abs(this.u) < 5 && this.agl < 120 && Math.abs(this.p) < 0.12) {
      this.heliHoverT += dt;
    } else if (!this.isHeli || Math.abs(this.u) > 8 || this.agl > 160) {
      this.heliHoverT = Math.max(0, this.heliHoverT - dt*0.35);
    }
    for (const m of this.msgs) m.t += dt;
    this.msgs = this.msgs.filter((m) => m.t < m.dur);
    this.shake = Math.max(0, this.shake - dt * 1.5);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 2);
    const sf = this.surfaceAt(this.x);
    this.groundH = sf.h;
    this.agl = this.y - (this.gear > 0.9 ? s.gearH : s.gearH * 0.4) - sf.h;
    this.maxAlt = Math.max(this.maxAlt, this.y);
    // ---- oleo suspension (visual only): legs relax towards rest length, shifted
    // forward under braking (nose dives, mains unload); touchdowns and joints
    // kick the velocity in touchdown() and below
    let targetN = SUSP_STATIC_N;
    let targetM = SUSP_STATIC_M;
    if (this.grounded && this.alive && this.gear > 0.5 && this.input.brake) {
      const sp = Math.abs(this.worldVx);
      if (sp > 1) {
        const dive = Math.min(0.14, 0.02 + sp * 0.0022);
        targetN += dive;
        targetM -= dive * 0.6;
      }
    }
    [this.suspN, this.suspVN] = oleoStep(this.suspN, this.suspVN, targetN, dt);
    [this.suspM, this.suspVM] = oleoStep(this.suspM, this.suspVM, targetM, dt);
    // fighters work their oleos over taxiway joints while rolling SLOWLY: both
    // gears kick as one crossing each slab edge, and the kicks fade as lift
    // unloads the gear — so slow taxi hops and fast rolls stay smooth
    if (s.taxiBounce && this.alive) {
      const JOINT = 9;
      const j = Math.floor(this.x / JOINT);
      if (!this.jointInit || !this.grounded || this.gear <= 0.5) {
        this.lastJoint = j;
        this.jointInit = true;
      } else {
        const sp = Math.abs(this.worldVx);
        if (sp > 0.5) {
          const vr = Math.max(20, s.vRotate);
          const unload = clamp(1 - (sp / vr) * (sp / vr), 0, 1);
          const kick = 1.8 * unload * unload;
          if (kick > 0.01 && j !== this.lastJoint) {
            const k = kick * (0.7 + 0.6 * hash(j * 3.13));
            this.suspVN += k;
            this.suspVM += k;
          }
        }
        this.lastJoint = j;
      }
    }
    if (this.alive) {
      this.flightTime += dt;
      this.distance += Math.abs(this.worldVx) * dt;
      // ---- EGPWS: TERRAIN AHEAD caution, escalating to PULL UP ----
      // The old warning only fired while already descending into the ground.
      // This one looks 20+ seconds down the flight path: if rising terrain
      // ahead punches through the projected climb (or level cruise), the
      // pilot gets an amber TERRAIN AHEAD with time to climb or turn away,
      // and a red PULL UP once impact is seconds away.
      let warn = false;
      let ahead = false;
      let aheadDist = 0;
      let aheadH = 0;
      if (!this.grounded) {
        const vxw = this.worldVx;
        const gs = Math.max(Math.abs(vxw), 25);
        // mid-reversal the nose sweeps both ways, so watch both directions
        const dirs = this.turning ? [1, -1] : [Math.abs(vxw) > 8 ? Math.sign(vxw) : this.hdg];
        // landing inhibit: once stabilised on final the runway environment
        // ahead is expected — but terrain piercing the glidepath still
        // escalates to PULL UP below, inhibited or not
        const landingCfg = this.gear > 0.9 && this.flapPos > 0.5;
        let established = false;
        if (landingCfg && this.agl < 500 && this.mode === 'open') {
          const g = this.glidepath();
          if (g && g.dist < 7000 && Math.abs(g.dev) < 90) established = true;
        }
        const margin = this.terrainAhead ? 150 : 90; // hysteresis: no flicker
        // on a stabilised final the red only shouts when the projected path
        // truly goes into the hill — a normal 3° path skimming a knoll ahead
        // of the threshold must not set it off
        const escMargin = established ? 2 : 25;
        const maxDist = Math.min(9000, Math.max(2500, gs * 22));
        for (const dir of dirs) {
          let found = false;
          const escDist = Math.min(maxDist, gs * 7.5);
          for (let dist = 400; dist <= maxDist; dist += 150) {
            // past the red window the nearest caution breach decides
            if (found && dist > escDist) break;
            const px = this.x + dir * dist;
            const terr = Math.max(terrainHeight(px, this.mode), 0);
            // only rising ground is a threat: flat land below the flight
            // path is what the sink-rate check underneath is for
            if (terr < this.groundH + 60) continue;
            const t = dist / gs;
            const clearance = this.y + this.vy * t - terr;
            if (!found && !established && clearance < margin) {
              found = true;
              if (!ahead || dist < aheadDist) {
                ahead = true;
                aheadDist = dist;
                aheadH = terr;
              }
            }
            // red escalation: the projected path pierces rising terrain
            // within seconds — shout even on final
            if (dist <= escDist && clearance < escMargin) warn = true;
          }
        }
        // classic sink-rate warning: dropping fast onto the ground right now
        if (!warn) {
          for (let t = 1.5; t <= 7; t += 1.5) {
            const px = this.x + vxw * t;
            const py = this.y + this.vy * t;
            const g = Math.max(terrainHeight(px, this.mode), 0);
            if (py < g + 25 && this.vy < -2) warn = true;
          }
          if (landingCfg && this.agl < 400) warn = warn && this.vy < -8;
        }
      }
      this.pullUp = warn;
      this.terrainAhead = ahead;
      // GPWS mode 4: wheels up, low, slow and coming down — the HUD and the
      // "TOO LOW GEAR" voice share this one flag so they never disagree
      this.tooLowGear = !s.fixedGear && !this.grounded && this.gearCmd < 0.5 && this.agl < 120 && this.ias < 1.5 * s.vs && this.vy < 0;
      // reactive windshear: microburst outflow at low altitude
      this.windshear = !this.grounded && !!this.air && this.air.micro > 0.4;
      if (ahead) {
        this.terrainAheadDist = aheadDist;
        this.terrainAheadH = aheadH;
      }
      this.refuelTick(dt);
    }
    this.updateParticles(dt);
    this.emitEffects(dt);
  }

  /**
   * Suspension pose for the renderer: fuselage lift (m, +up), extra pitch
   * (rad, +nose-up) and per-leg dynamic deflection (m, +compressed) solved so
   * both wheels stay planted while the airframe rides the oleos. Parked it is
   * all zeroes; touchdowns squash through the springs above, and taxiway joints
   * kick them while fighters roll slowly on their gear.
   */
  suspPose(): { lift: number; dpitch: number; nose: number; main: number } {
    const dN = this.suspN - SUSP_STATIC_N;
    const dM = this.suspM - SUSP_STATIC_M;
    const wb = this.spec.noseX - this.spec.mainX;
    const dp = wb > 0.01 ? (dM - dN) / wb : 0;
    const lift = -(dN + dM) / 2 - (dp * (this.spec.noseX + this.spec.mainX)) / 2;
    return { lift, dpitch: dp, nose: dN, main: dM };
  }

  /**
   * Landing guidance: where the ideal 3° glidepath to the nearest runway
   * threshold (or the carrier deck) is. Returns null when nothing is in range.
   */
  glidepath(): { name: string; dist: number; ideal: number; dev: number } | null {
    const deg = Math.tan((this.mode === 'carrier' ? 3.5 : 3) * (Math.PI / 180));
    if (this.carrier) {
      const thr = this.carrier.x;
      const dist = this.x - thr;
      if (dist < -200 || dist > 9000) return null;
      const ideal = DECK_H + 2 + Math.max(0, dist) * deg;
      return { name: 'CARRIER', dist: Math.max(0, dist), ideal, dev: this.y - ideal };
    }
    let best: { name: string; dist: number; ideal: number; dev: number } | null = null;
    for (const ap of airportsNear(this.x, 1)) {
      for (const sign of [-1, 1]) {
        const thr = ap.x + (sign * ap.len) / 2;
        const dist = (thr - this.x) * this.hdg;
        if (dist < 60 || dist > 7000) continue;
        const ideal = ap.elev + this.spec.gearH * 0.6 + dist * deg;
        const cand = { name: ap.name, dist, ideal, dev: this.y - ideal };
        if (!best || dist < best.dist) best = cand;
      }
    }
    return best;
  }

  /** Weather, hazards, mission progress and career bookkeeping, once per frame. */
  private updateEnvironment(dt: number): void {
    const s = this.spec;
    const wx = this.weather;
    wx.update(dt, this.time);
    if (wx.preset.storm && this.alive) this.stormFlight = true;
    if (this.tod === 'night' && this.alive) this.nightFlight = true;
    this.maxG = Math.max(this.maxG, this.g);
    this.maxMach = Math.max(this.maxMach, this.mach);
    this.minVis = Math.min(this.minVis, wx.visibility(this.x, this.y, this.air?.cloud ?? 0));
    this.maxIce = Math.max(this.maxIce, this.ice);
    this.maxCrosswind = Math.max(this.maxCrosswind, Math.abs(this.wind.cross));

    // --- airframe icing: cold + visible moisture = ice on the wings
    const temp = wx.tempAt(this.y);
    const moisture = clamp((this.air?.cloud ?? 0) * 0.85 + (this.air?.precip ?? 0) * 0.8, 0, 1);
    const icingAir = moisture * smoothstep(4.5, 1.5, temp) * smoothstep(-30, -18, temp);
    if (!this.grounded && this.alive && icingAir > 0.04) {
      const iceScale = this.sandbox && this.sandbox.on ? this.sandbox.ice : 1;
      const rate = icingAir * 0.0075 * (1 + this.ias / 130) * (1 - (s.deIce ?? 0)) * iceScale;
      this.ice = clamp(this.ice + rate * dt, 0, 1);
    } else {
      this.ice = Math.max(0, this.ice - dt * 0.008 * (1 + (s.deIce ?? 0) * 4));
    }
    if (this.ice > 0.18 && this.time - this.icingSaid > 13) {
      this.icingSaid = this.time;
      this.say(
        t2('AIRFRAME ICING', 'ENGELAMIENTO'),
        'warn',
        t2('Climb, descend or leave the cloud — drag is rising', 'Cambia de nivel o sal de la nube: la resistencia sube'),
        4,
      );
    }

    // --- lightning
    const flash = wx.maybeStrike(dt, this.x, this.y, this.time);
    if (flash > 0.35 && this.alive) {
      this.shake = Math.max(this.shake, flash * 0.5);
      this.hitFlash = Math.max(this.hitFlash, flash * 0.22);
    }
    if (wx.thunder > 0.01) {
      this.thunderPulse = wx.thunder;
      wx.thunder = 0;
    }
    if (wx.flash > 0.35 && this.alive) this.hitFlash = Math.max(this.hitFlash, wx.flash * 0.14);

    // --- wind shear / microburst alert (this is what kills you on final)
    if (this.alive && !this.grounded && this.agl < 600 && this.air && this.air.micro > 0.35) {
      if (this.time - this.shearSaid > 11) {
        this.shearSaid = this.time;
        this.say(
        t2('WIND SHEAR', 'CIZALLADURA'),
        'warn',
        t2('Microburst outflow — go around!', 'Micro-ráfaga: ¡frustrada!'),
        3.5,
      );
      }
    }

    // --- combo decay
    this.comboT += dt;
    if (this.combo > 0 && this.comboT > 22) {
      this.combo = Math.max(0, this.combo - 1);
      this.comboT = 0;
    }

    // --- mission progress
    if (this.mission) {
      const run = this.mission;
      const before = run.gatesHit;
      run.update(dt, {
        x: this.x,
        y: this.y,
        agl: Math.max(0, this.agl),
        ias: this.ias,
        grounded: this.grounded,
        onDeck: this.surfaceAt(this.x).kind === 'deck',
        alive: this.alive,
        time: this.time,
      });
      if (run.gatesHit > before) {
        this.combo += 1;
        this.comboT = 0;
        this.score += Math.round(150 * this.comboMult());
      }
      this.flushMission();
      if (run.status === 'failed' && !this.notes.includes('mission-failed')) {
        this.notes.push('mission-failed');
        this.combo = 0;
      }
    }
  }

  private refuelTick(dt: number): void {
    const s = this.spec;
    const stopped = this.grounded && Math.abs(this.u - (this.carrier && this.surfaceAt(this.x).kind === 'deck' ? this.carrier.vx * this.hdg : 0)) < 0.4;
    const okPlace = this.surfaceAt(this.x).kind === 'deck' || !!airportAt(this.x, 500);
    if (stopped && okPlace && this.throttle < 0.12 && this.fuel < s.fuelMax - 0.5 && !this.belly) {
      if (!this.refueling) this.say('Refuelling…', 'info', '', 2);
      this.refueling = true;
      this.fuel = Math.min(s.fuelMax, this.fuel + s.fuelMax * 0.05 * dt);
      if (this.fuel >= s.fuelMax - 0.5) {
        this.say('Tanks full', 'good', '', 2);
        this.engineOut = false;
        this.lowFuelSaid = false;
      }
    } else this.refueling = false;
  }

  // ---------------------------------------------------------------- physics step
  private step(h: number): void {
    this.time += h;
    if (this.carrier) this.carrier.x += this.carrier.vx * h;
    if (!this.alive) {
      this.wreck(h);
      return;
    }
    this.controls(h);
    const A = this.aero();
    this.structuralTick(h);
    if (this.grounded) this.groundStep(h, A);
    else this.airStep(h, A);
    if (!this.alive) return;
    this.x += this.u * this.cEff() * h;
    this.hookCheck();
    if (this.grounded) this.groundContacts();
    else this.airContacts();
    if (!this.alive) return;
    this.burnFuel(h);
    if (!this.grounded) this.airTime += h;
    this.propPhase += (6 + this.thrust * 70) * h;
  }

  private controls(h: number): void {
    const s = this.spec;
    const inp = this.input;
    // holding the turn key chains one reversal after another
    if (inp.turn && !this.turning) this.tryTurn(true);

    // autopilot altitude hold: fly the pitch to kill the height and sink errors
    // manual stick only — altHold below replaces this outright when engaged
    let pitchCmd = shapeStick(inp.pitch);
    if (this.altHold !== null) {
      if (this.grounded) this.altHold = null;
      else {
        // cascade: altitude error -> commanded vertical speed -> pitch. A plain
        // proportional loop saturates on the fast jets and pitch-oscillates;
        // this keeps the capture smooth at any cruise speed
        const err = this.altHold - this.y;
        const vTarget = clamp(err * 0.3, -15, 15);
        pitchCmd = clamp((vTarget - this.vy) * 0.22, -1, 1);
      }
    }
    // fighters are "sensitive": the servo drives the elevator harder
    const sensRate = this.sensEff;
    const rate = (Math.abs(pitchCmd) > 0.01 ? 3 : 4) * sensRate;
    this.elev += clamp(pitchCmd - this.elev, -rate * h, rate * h);

    if (this.autoThr && this.grounded) this.autoThr = false;
    if (this.autoThr) {
      this.atTarget = clamp(this.atTarget + inp.thr * 14 * h, 30, 600);
      const err = this.atTarget - this.ias;
      this.throttle = clamp(this.throttle + clamp(err * 0.05, -0.35, 0.35) * h, 0, 1);
    } else {
      this.throttle = clamp(this.throttle + inp.thr * 0.5 * h, 0, 1);
    }
    if (this.parked && this.throttle > 0.35 && !this.catHeld) this.parked = false;

    const tgt = this.fuel > 0 && !this.engineOut ? this.throttle : 0;
    this.thrust += (tgt - this.thrust) * (1 - Math.exp(-h / s.spool));

    this.gear += clamp(this.gearCmd - this.gear, -h / 3, h / 3);
    this.flapPos += clamp(this.flaps - this.flapPos, -h / 1.2, h / 1.2);
    this.hookPos += clamp((this.hook ? 1 : 0) - this.hookPos, -h, h);
    const ab = inp.brake && !this.grounded ? 1 : 0;
    this.airbrake += clamp(ab - this.airbrake, -2 * h, 2 * h);
    this.spoilerPos += clamp(this.spoilerCmd - this.spoilerPos, -1.5 * h, 1.5 * h);
    // rudder: used to hold the centreline in a crosswind and to de-crab
    this.rudder += clamp((inp.rudder ?? 0) - this.rudder, -3 * h, 3 * h);

    // crosswind drift: the closer to the ground, the more it matters
    const lowWork = this.grounded || this.agl < 260;
    if (lowWork) {
      const spd = Math.abs(this.u);
      // the airframe weathervanes into wind, so only a small residual drift remains;
      // the pilot trims it out with rudder
      const windPush = this.air.wz * 0.14 * clamp(spd / 30, 0, 1.2);
      const auth = clamp(0.9 + spd / 35, 0.9, 2.6) * (this.grounded ? 1 : 0.8);
      this.offset += (windPush - this.rudder * auth) * h;
      if (this.grounded && spd < 2.5) this.offset *= 1 - 0.6 * h;
    } else {
      this.offset *= 1 - 0.25 * h;
    }
    if (this.offset > 40) this.offset = 40;
    if (this.offset < -40) this.offset = -40;

    if (this.turning) {
      this.turnT += h / this.turnDur;
      if (this.turnT >= 1) {
        this.hdg = -this.hdg;
        this.turnT = 0;
        this.turning = false;
      }
    }
  }

  private aero(): Aero {
    const s = this.spec;
    const ice = this.ice;
    const m = s.emptyMass + this.fuel + ice * 260;
    const alt = Math.max(0, this.y);
    const rho = 1.225 * Math.exp(-alt / 8500);
    this.rho = rho;
    const temp = Math.max(216.65, 288.15 - 0.0065 * alt);
    const a = 20.05 * Math.sqrt(temp);

    // --- atmosphere: mean wind, gusts, turbulence, thermals and ridge lift
    const slope = this.slopeAt(this.x);
    const rough =
      Math.abs(terrainHeight(this.x + 140, this.mode) - terrainHeight(this.x - 140, this.mode)) / 70 +
      Math.abs(terrainHeight(this.x + 40, this.mode) - terrainHeight(this.x - 40, this.mode)) / 30;
    const smoothness = clamp(1 - rough * 0.5, 0, 1);
    const air = this.weather.sample({
      x: this.x,
      y: this.y,
      time: this.time,
      isDay: this.tod !== 'night',
      mode: this.mode,
      slope,
      smoothness,
    });
    this.air = air;

    const c = this.cEff();
    const cs = c >= 0 ? 1 : -1;
    const vrx = this.u - air.wx * c;
    const vry = this.vy - air.wy;
    const V = Math.max(0.5, Math.hypot(vrx, vry));
    const gamma = Math.atan2(vry, vrx);
    const alpha = wrapPi(this.p - gamma);
    const mach = V / a;
    const q = 0.5 * rho * V * V;
    this.tas = V;
    this.mach = mach;
    this.ias = V * Math.sqrt(rho / 1.225);
    this.aoa = alpha;
    this.wind = {
      head: -air.wx * cs,
      cross: air.wz,
      speed: Math.hypot(air.wx, air.wz),
      gust: air.gust,
      turb: air.turb,
    };
    this.crab = (Math.atan2(air.wz, Math.max(18, this.ias)) * 180) / Math.PI;

    const bank = this.turning && this.turnKind === 'air' ? 1.0 * Math.sin(Math.PI * this.turnT) : 0;
    const cosB = Math.cos(bank);

    const a0 = s.alpha0 - 0.05 * this.flapPos;
    const aStall = s.alphaStall * (1 - 0.16 * ice);
    const cla = s.CLa * (1 - 0.2 * ice);
    const lc = liftCoef(alpha, cla, a0, aStall);
    const cl = lc.cl * (1 - 0.35 * this.spoilerPos); // spoilers kill lift, air and ground
    let Cd = s.Cd0 + s.flapCd * this.flapPos + s.gearCd * this.gear + 0.045 * this.airbrake + 0.085 * this.spoilerPos;
    Cd += 0.026 * ice * (1 - (s.deIce ?? 0) * 0.5) * 2.2 + ice * 0.012;
    if (s.kind === 'jet') {
      Cd += (s.waveCd ?? 1) * (0.026 * smoothstep(0.88, 1.08, mach) + 0.012 * Math.exp(-Math.pow((mach - 1.05) / 0.12, 2)));
    } else if (mach > 0.65) Cd += 1.5 * Math.pow(mach - 0.65, 2);
    Cd += s.k * cl * cl + 1.4 * lc.stall * Math.sin(alpha) * Math.sin(alpha) + 0.25 * Math.sin(alpha) * Math.sin(alpha);

    const Lraw = q * s.S * cl;
    const L = Lraw * cosB;
    const D = q * s.S * Cd;

    let T = 0;
    const dens = rho / 1.225;
    let Fx = 0;
    let Fy = 0;
    const sg = Math.sin(gamma);
    const cg = Math.cos(gamma);
    if (s.kind === 'heli') {
      // heli rotor thrust is along mast (body Y), tilted by pitch
      const densFac = Math.pow(dens, 0.62);
      let tFac = this.thrust;
      // hydraulic failure reduces collective authority
      if (this.emergency && this.emergency.kind === 'hydraulic') tFac *= 0.82;
      T = tFac * s.thrustStatic * densFac;
      if (this.engineOut) T *= 0.05;
      else if (this.emergency && this.emergency.kind === 'engineFire') T *= 0.36;
      // electrical may cause intermittent cut
      if (this.emergency && this.emergency.kind === 'electrical' && Math.random() < 0.015) T *= 0.55;
      const Fx_rotor = -T * Math.sin(this.p);
      const Fy_rotor = T * Math.cos(this.p);
      // parasite + rotor induced drag, small wing-like lift
      const CdH = s.Cd0 + s.gearCd * this.gear + 0.04 * this.spoilerPos;
      const Dpara = q * s.S * CdH;
      const Lheli = q * s.S * 0.32 * Math.sin(alpha) * (1 - 0.35 * this.spoilerPos);
      const D = Dpara + s.k * Lheli * Lheli + 0.05 * Math.abs(Lheli);
      Fx = Fx_rotor - Lheli * sg - D * cg;
      Fy = Fy_rotor + Lheli * cg - D * sg;
      // g for heli is rotor thrust/weight, not wing lift
      this.g = this.grounded ? 1 : Fy_rotor / (m * G);
    } else {
      if (s.kind === 'prop') {
        const lapse = Math.pow(dens, 0.8);
        T = this.thrust * Math.min(s.thrustStatic * dens, (s.propEff * s.power * lapse) / Math.max(V, 14));
      } else {
        const t = this.thrust;
        const frac = t <= 0.85 ? t / 0.85 : 1 + ((t - 0.85) / 0.15) * (s.thrustAB / s.thrustMil - 1);
        const idle = this.fuel > 0 && !this.engineOut ? 0.03 : 0;
        T = s.thrustMil * (idle + frac) * Math.pow(dens, 0.85) * (1 + 0.3 * Math.min(mach, 1.8));
      }
      Fx = T * Math.cos(this.p) - L * sg - D * cg;
      Fy = T * Math.sin(this.p) + L * cg - D * sg;
      this.g = this.grounded ? 1 : Lraw / (m * G);
    }

    if (s.kind !== 'heli') this.g = this.grounded ? 1 : Lraw / (m * G);
    this.stallWarn = alpha > 0.88 * aStall && alpha < 2 && !this.grounded ? 1 : 0;
    if (s.kind === 'heli') this.stallWarn = this.vy < -8 && !this.grounded ? 0.6 : 0;
    this.overspeed = this.ias > s.vne || (s.kind === 'jet' && mach > (s.mmo ?? 2.0));
    if ((this.ias > s.vne * 1.28 || mach > 2.5) && !this.grounded) this.crash('Structural failure — overspeed', false);

    return { m, T, L, D, Fx, Fy, q, V, gamma, alpha };
  }

  private burnFuel(h: number): void {
    const s = this.spec;
    if (this.sandbox && this.sandbox.on && this.sandbox.fuel) {
      // infinite fuel keeps the tanks topped up
      this.fuel = s.fuelMax;
      this.engineOut = false;
      return;
    }
    if (this.fuel <= 0) return;
    let burn: number;
    if (s.kind === 'jet') {
      const ab = Math.max(0, this.thrust - 0.85) / 0.15;
      burn = s.fuelIdle + (s.fuelMil - s.fuelIdle) * Math.min(this.thrust, 0.85) / 0.85 + ab * s.fuelAB;
    } else burn = s.fuelIdle + (s.fuelMil - s.fuelIdle) * this.thrust;
    this.fuel = Math.max(0, this.fuel - burn * h);
    if (!this.lowFuelSaid && this.fuel < s.fuelMax * 0.15 && this.fuel > 0) {
      this.lowFuelSaid = true;
      this.say('LOW FUEL', 'warn', 'Find a runway or the carrier', 3.5);
    }
    if (this.fuel <= 0 && !this.engineOut) {
      this.engineOut = true;
      this.say('FUEL EXHAUSTED', 'bad', 'Engine out — glide to a landing', 4);
    }
  }

  // ---------------------------------------------------------------- airborne
  private airStep(h: number, A: Aero): void {
    const s = this.spec;
    const { m, q, gamma } = A;
    // heli hydraulic failure adds a bit of extra drag/lag
    let hxMul = 1;
    if (this.emergency && this.emergency.kind === 'hydraulic') hxMul = 0.86;
    this.u += (A.Fx / m) * h * hxMul;
    this.vy += (A.Fy / m - G) * h * hxMul;
    // evasive high-g turns: agile airframes hold their energy better
    if (this.g > 4 && this.sensEff > 1) this.u += (this.sensEff - 1) * 0.35 * h;
    // ---- heli: cyclic directly sets pitch (no AoA trim), rotor damps quickly
    if (s.kind === 'heli') {
      const target = this.elev * 0.42 + (this.altHold !== null ? clamp((this.altHold - this.y) * 0.015, -0.22, 0.22) : 0);
      const sens = this.sensEff * (this.emergency && this.emergency.kind === 'hydraulic' ? 0.62 : 1);
      const Kp = 4.5 * sens;
      const Kd = 2.2;
      this.w += (Kp * (target - this.p) - Kd * this.w) * h;
      // turbulence still hits heli but a bit softer when assist on
      const damp = 1 - (s.turbDamp ?? 0) * (this.assist ? 0.5 : 1);
      const tb = Math.min(this.air.turb, 1.35) * damp;
      if (tb > 0.02) {
        const kick = (noise1(this.time * 4.3, 73) - 0.5) * 2;
        this.w += kick * 0.55 * tb * h;
      }
      this.p = wrapPi(this.p + this.w * h);
      // collective inertia is already in thrust spool; vertical damping
      this.vy *= 1 - 0.08 * h;
      this.y += this.vy * h;
      return;
    }

    const bank = this.turning && this.turnKind === 'air' ? 1.0 * Math.sin(Math.PI * this.turnT) : 0;
    const cosB = Math.cos(bank);
    const a0 = s.alpha0 - 0.05 * this.flapPos;
    const qq = Math.max(q, 1);
    const W = m * G;
    const qf = Math.max(q / (q + 0.5 * 1.225 * Math.pow(0.8 * s.vs, 2)), 0.05);
    const sens = this.sensEff;
    const Kq = s.pitchK * sens * qf;
    const Cq = 1.7 * Math.sqrt(Kq) + 0.25;

    let aTrim: number;
    if (this.assist) aTrim = a0 + (W * Math.cos(gamma)) / (qq * s.S * cosB) / s.CLa;
    else aTrim = s.alpha0 + 0.5 * (s.alphaStall - s.alpha0) + this.trimOff;
    if (this.assist && Math.cos(gamma) > 0.1) aTrim -= 0.18 * clamp(gamma, -0.9, 0.9);
    aTrim = clamp(aTrim, -0.85 * s.alphaStall, 0.85 * s.alphaStall);

    const e = this.elev;
    const aLim = s.alphaMax ?? 1.18 * s.alphaStall;
    let aCmd = e >= 0 ? aTrim + e * (aLim - aTrim) : aTrim + e * (aTrim + 0.55 * s.alphaStall);
    // fighters hold a minimum turn rate: the g-limiter opens up with speed so
    // the jet still carves at Mach instead of flying a 10 km arc; the altitude
    // autopilot keeps the stock limit its capture loop was tuned for
    const gLim = this.altHold !== null ? s.gmax : Math.max(s.gmax, ((s.minTurnRate ?? 0) * A.V) / G);
    const aMaxG = a0 + (gLim * W) / (qq * s.S) / s.CLa;
    const aMinG = a0 - (s.gmin * W) / (qq * s.S) / s.CLa;
    aCmd = clamp(aCmd, aMinG, aMaxG);
    if (A.alpha > 0.9 * s.alphaStall && A.alpha < 1.5) aCmd += (Math.random() - 0.5) * 0.06;

    const err = clamp(aCmd - A.alpha, -0.8, 0.8);
    this.w += (Kq * err - Cq * this.w) * h;

    // --- turbulence: random pitching moments the pilot has to fight
    const damp = 1 - (s.turbDamp ?? 0) * (this.assist ? 0.5 : 1);
    const tb = Math.min(this.air.turb, 1.35) * damp;
    if (tb > 0.02) {
      const kick = (noise1(this.time * 4.3, 73) - 0.5) * 2;
      const slow = (noise1(this.time * 0.63, 91) - 0.5) * 2;
      // keep the disturbance comparable to the elevator authority, otherwise
      // the airframe is uncontrollable in anything above a breeze
      this.w += (kick * 0.78 + slow * 0.5) * tb * h * (0.5 + 45 / Math.max(45, this.ias));
    }

    this.p = wrapPi(this.p + this.w * h);
    this.y += this.vy * h;
  }

  /** Over-g, over-speed and violent air can break the airframe. */
  private structuralTick(h: number): void {
    const s = this.spec;
    if (this.grounded || !this.alive || this.god) return;
    const gLim = Math.max(s.gmax, ((s.minTurnRate ?? 0) * this.tas) / G);
    if (this.g > gLim * 1.04) this.damage += (this.g - gLim * 1.04) * 0.1 * h;
    if (this.ias > s.vne * 1.02) this.damage += ((this.ias - s.vne * 1.02) / s.vne) * 0.35 * h;
    if (this.air.turb > 0.9) this.damage += (this.air.turb - 0.9) * 0.012 * h;
    if (this.damage >= 1) {
      this.crash('Airframe overstress', false);
      return;
    }
    if (this.damage > 0.45 && this.time - this.lastDamageSaid > 12) {
      this.lastDamageSaid = this.time;
      this.say(t2('AIRFRAME DAMAGE', 'DAÑOS ESTRUCTURALES'), 'warn', t2('Ease off — the airframe is bending', 'Suaviza: la célula se está doblando'), 3.5);
    }
  }

  comboMult(): number {
    return 1 + Math.min(1, this.combo * 0.1);
  }

  comboUp(points: number): void {
    this.combo += 1;
    this.comboT = 0;
    this.score += Math.round(points * this.comboMult());
  }

  // ---------------------------------------------------------------- ground
  private groundStep(h: number, A: Aero): void {
    const s = this.spec;
    if (this.turning && this.turnKind === 'ground') {
      this.u = 0;
      this.vy = 0;
      return;
    }
    const c = this.hdg;
    const cp = Math.cos(this.p);
    const sp = Math.sin(this.p);
    const gearDown = this.gear > 0.9 && !this.belly;
    const hSup = gearDown ? s.gearH : s.gearH * 0.36;
    const mxo = gearDown ? s.mainX : 0;
    const mx = this.x + (mxo * cp + hSup * sp) * c;
    const surf = this.surfaceAt(mx);
    const surfV = surf.vx;
    let uRel = this.u - surfV * c;

    // friction — wet runways and contaminated surfaces cost you braking action
    const wet = surf.kind === 'runway' || surf.kind === 'deck' ? this.weather.wetness : this.weather.wetness * 0.5;
    const braking = this.input.brake || this.parked;
    // heli with hydraulic failure has weaker brakes
    let brakeMul = (s.brakePower ?? 1) * (s.brakeBonus ?? 1);
    if (this.emergency && this.emergency.kind === 'hydraulic') brakeMul *= 0.55;
    let mu = this.belly || !gearDown ? 0.5 : 0.03;
    if (gearDown) {
      if (surf.kind === 'grass') mu = 0.07;
      else if (surf.kind === 'sand' || surf.kind === 'snow') mu = 0.12;
      else if (surf.kind === 'rock') mu = 0.2;
      if (braking) mu = 0.7 * brakeMul;
    }
    const hydroplaning = wet > 0.45 && Math.abs(uRel) > 40 ? 0.32 : 1;
    mu *= (1 - 0.42 * wet) * hydroplaning;
    const normal = s.kind === 'heli' ? Math.max(0, G - A.Fy / A.m) : Math.max(0, G - A.L / A.m);
    const df = mu * normal * h;

    if (this.catHeld) {
      uRel = 0;
    } else if (this.catActive) {
      uRel += this.catAccel * h;
      if (this.x - (this.carrier ? this.carrier.x : 0) >= CAT_END) this.catActive = false;
    } else if (this.arrested) {
      uRel = Math.max(0, uRel - this.arrestDecel * h);
      if (uRel <= 0.05) {
        uRel = 0;
        if (!this.trapped) this.finishTrap();
      }
    } else {
      let v1 = uRel + (A.Fx / A.m) * h;
      if (Math.abs(v1) <= df) v1 = 0;
      else v1 -= Math.sign(v1) * df;
      uRel = v1;
    }
    this.u = uRel + surfV * c;

    // --- crosswind drift: hold the centreline or you will leave the paved surface
    const halfW = surf.kind === 'deck' ? 15 : surf.kind === 'runway' ? 18 : surf.kind === 'grass' ? 12 : 16;
    if (Math.abs(this.offset) > halfW) {
      this.excursionTimer += h;
      if (!this.god) this.damage += Math.min(0.6, Math.abs(this.u) / 70) * 0.55 * h;
      if (this.damage >= 1 || (this.excursionTimer > 1.4 && Math.abs(this.u) > 20)) {
        this.crash('Ran off the runway', false);
        return;
      }
    } else this.excursionTimer = 0;

    // pitch on the ground
    const slope = this.slopeAt(mx);
    const beta = Math.atan(slope * c);
    const gf = smoothstep(0.5 * s.vs, 0.85 * s.vs, this.ias);
    let tgt = beta;
    if (this.catActive) tgt = beta + s.launchPitch * clamp((this.x - this.catStartX) / 40, 0, 1);
    else if (gearDown) tgt = beta + Math.max(0, this.elev) * gf * s.tailAngle * 0.95;
    this.p += clamp(tgt - this.p, -0.5 * h, 0.16 * h);
    this.w = (tgt - this.p) > 0.001 ? 0.1 : 0;

    const offMain = mxo * Math.sin(this.p) - hSup * Math.cos(this.p);
    const newY = surf.h - offMain;
    if (this.y - newY > 0.6 && !this.arrested) {
      this.grounded = false;
      this.airTime = 0;
      this.catActive = false;
      if (this.deckTouched && !this.arrested) {
        this.deckTouched = false;
        this.say('BOLTER!', 'warn', 'Full power — go around', 3);
      }
      return;
    }
    if (surf.kind === 'water') {
      this.crash('Ditched in the sea', true);
      return;
    }
    const liftNet = A.Fy - A.m * G;
    const heliLiftOk = s.kind === 'heli' && liftNet > 0.02 * A.m * G;
    const wingLiftOk = liftNet > 0.1 * A.m * G && this.p > beta + 0.015;
    if ((heliLiftOk || wingLiftOk) && !this.catActive && !this.catHeld && !this.arrested && !this.belly) {
      this.grounded = false;
      this.airTime = 0;
      this.vy = Math.max(this.vy, s.kind === 'heli' ? 0.6 : 0.4);
      this.y += 0.05;
      if (this.deckTouched && this.carrier) {
        this.deckTouched = false;
        this.say('BOLTER!', 'warn', 'Full power — go around', 3);
      } else if (this.airTime === 0 && Math.abs(this.u) > s.vs * 0.6) {
        this.say('Airborne', 'info', '', 1.4);
      } else if (s.kind === 'heli') {
        this.say(t2('AIRBORNE — HOVER', 'EN EL AIRE — ESTACIONARIO'), 'good', t2('Collective controls altitude', 'El colectivo controla la altura'), 2);
      }
      return;
    }
    this.vy = clamp((newY - this.y) / h, s.kind === 'heli' ? -3 : -6, 6);
    this.y = newY;
  }

  private groundContacts(): void {
    if (this.turning && this.turnKind === 'ground') return;
    const pts = this.points();
    const c = this.cEff();
    const cp = Math.cos(this.p);
    const sp = Math.sin(this.p);
    for (const pt of pts) {
      if (pt.wheel) continue;
      if (pt.belly && (this.belly || this.gear < 0.9)) continue;
      const wx = this.x + (pt.x * cp - pt.y * sp) * c;
      const wy = this.y + pt.x * sp + pt.y * cp;
      const sf = this.surfaceAt(wx);
      if (sf.h - wy > 0.7) {
        this.crash('Collided with terrain', false);
        return;
      }
    }
  }

  private points(): { x: number; y: number; wheel: boolean; belly: boolean }[] {
    const s = this.spec;
    const p = [
      { x: s.length * 0.5, y: -0.1, wheel: false, belly: false },
      { x: -s.length * 0.46, y: 0.3, wheel: false, belly: false },
      { x: 0, y: -s.gearH * 0.36, wheel: false, belly: true },
    ];
    if (this.gear > 0.9) {
      p.push({ x: s.mainX, y: -s.gearH, wheel: true, belly: false });
      p.push({ x: s.noseX, y: -s.gearH, wheel: true, belly: false });
    }
    return p;
  }

  private airContacts(): void {
    const s = this.spec;
    const c = this.cEff();
    const cp = Math.cos(this.p);
    const sp = Math.sin(this.p);
    let wheelPen = 0;
    let bodyPen = 0;
    let worst: Surface | null = null;
    let worstX = 0;
    let worstPen = 0;
    for (const pt of this.points()) {
      const wx = this.x + (pt.x * cp - pt.y * sp) * c;
      const wy = this.y + pt.x * sp + pt.y * cp;
      const sf = this.surfaceAt(wx);
      const pen = sf.h - wy;
      if (pen > 0) {
        if (pt.wheel) wheelPen = Math.max(wheelPen, pen);
        else bodyPen = Math.max(bodyPen, pen);
        if (pen > worstPen) {
          worstPen = pen;
          worst = sf;
          worstX = wx;
        }
      }
    }
    if (!worst) return;
    if (worst.kind === 'water') {
      this.crash('Ditched in the sea', true);
      return;
    }
    if (worstPen > 2.2) {
      this.crash(worst.kind === 'deck' ? 'Crashed into the carrier' : 'Flew into terrain', false);
      return;
    }
    const slope = this.slopeAt(worstX);
    const closing = -(this.vy - slope * (this.u * c - worst.vx));
    const beta = Math.atan(slope * this.hdg);
    if (wheelPen > 0 && wheelPen >= bodyPen - 0.15) {
      const rel = this.p - beta;
      if (closing > s.maxSink * (s.gearTol ?? 1)) this.crash('Gear collapsed — landing too hard', false);
      else if (rel < -0.09 || rel > s.tailAngle + 0.12) this.crash('Bad touchdown attitude', false);
      else this.touchdown(closing, worst, false);
    } else if (closing < 2.4 && Math.abs(this.p - beta) < 0.3 && bodyPen < 1.2) {
      this.touchdown(closing, worst, true);
    } else this.crash('Impact with terrain', false);
  }

  private touchdown(closing: number, surf: Surface, belly: boolean): void {
    const s = this.spec;
    if (this.turning) {
      if (this.turnT > 0.5) this.hdg = -this.hdg;
      this.turnT = 0;
      this.turning = false;
    }
    const wasAir = this.airTime;
    this.grounded = true;
    this.vy = 0;
    this.w = 0;
    this.belly = belly;
    this.sinkRate = closing;
    this.autoThr = false;
    this.shake = Math.min(1, 0.25 + closing * 0.1);
    // oleos soak the impact together, both gears equally (belly slides don't bounce)
    if (!belly && this.gear > 0.5) {
      this.suspVM += closing * 1.5;
      this.suspVN += closing * 1.5;
    }
    const c = this.hdg;
    const wxo = this.x + s.mainX * c;
    for (let i = 0; i < 14; i++) {
      this.addParticle('smoke', wxo, surf.h + 0.3, -c * (2 + Math.random() * 10) + surf.vx, Math.random() * 2, 1.2 + Math.random(), 0.8, 3, [210, 210, 215]);
    }
    // airframe damage from a hard touchdown
    if (!this.god) this.damage += clamp((closing - s.maxSink * 0.55) / (s.maxSink * 1.6), 0, 0.55);
    if (belly) {
      for (let i = 0; i < 30; i++) this.addParticle('spark', this.x, surf.h + 0.3, (Math.random() - 0.5) * 30, Math.random() * 12, 0.5, 0.25, 0, [255, 200, 90]);
      this.say(t2('BELLY LANDING', 'ATERRIZAJE SOBRE EL VIENTRE'), 'warn', t2('You forgot the landing gear!', '¡Se te olvidó el tren de aterrizaje!'), 4);
      this.gearCmd = 0;
      if (!this.god) this.damage += 0.2;
      return;
    }
    if (surf.kind === 'deck') {
      this.deckTouched = true;
      return;
    }
    const ap = airportAt(this.x, 300);
    const onRunway = surf.kind === 'runway';
    if (this.mission) {
      this.mission.onLanding({ x: this.x, sink: closing, airportId: ap ? ap.id : null, onRunway, surface: surf.kind });
      this.flushMission();
    }
    if (wasAir > 6) {
      this.landings++;
      this.bestLandingSink = Math.min(this.bestLandingSink, closing);
      const off = Math.abs(this.offset);
      const crossKt = Math.abs(this.wind.cross) * 1.944;
      let text = t2('Hard landing', 'Aterrizaje duro');
      let kind: Msg['kind'] = 'warn';
      if (closing < 1.3) {
        text = t2('Perfect touchdown!', '¡Toma perfecta!');
        kind = 'good';
        this.events.add('perfect_landing');
      } else if (closing < 2.6) {
        text = t2('Smooth landing', 'Aterrizaje suave');
        kind = 'good';
        this.events.add('smooth_landing');
      } else if (closing < 4.2) {
        text = t2('Firm landing', 'Aterrizaje firme');
        kind = 'info';
      }
      let pts = Math.round(Math.max(0, 1 - closing / s.maxSink) * 300) + (ap ? 100 : 0);
      const notes: string[] = [];
      notes.push(`${closing.toFixed(1)} m/s`);
      if (off > 6 && onRunway) {
        const pen = Math.min(160, Math.round(off * 9));
        pts -= pen;
        notes.push(t2(`${off.toFixed(0)} m off centre`, `a ${off.toFixed(0)} m del eje`));
        if (off > 13) kind = 'warn';
      } else if (onRunway) notes.push(t2('on centreline', 'sobre el eje'));
      if (crossKt > 8 && off <= 8) {
        pts += 120;
        notes.push(t2('crosswind handled', 'viento cruzado dominado'));
        this.events.add('crosswind_landing');
      } else if (crossKt > 8) notes.push(t2(`crosswind ${Math.round(crossKt)} kt`, `viento cruzado ${Math.round(crossKt)} kt`));
      if (this.weather.preset.vis < 1200) {
        pts += 150;
        this.events.add('fog_landing');
        notes.push(t2('in fog', 'con niebla'));
      }
      if (this.ice > 0.2) {
        this.events.add('ice_landing');
        notes.push(t2(`ice ${Math.round(this.ice * 100)}%`, `hielo ${Math.round(this.ice * 100)}%`));
      }
      if (this.tod === 'night') {
        pts += 90;
        this.events.add('night_landing');
      }
      if (!ap) notes.push(t2('off-airfield', 'fuera de aeródromo'));
      else notes.push(ap.name);
      const mult = this.comboMult();
      this.score += Math.max(0, Math.round(pts * mult));
      this.combo += 1;
      this.comboT = 0;
      this.say(text, kind, `${notes.join(' · ')} · +${Math.max(0, Math.round(pts * mult))}${this.combo > 1 ? ` (×${this.combo})` : ''}`, 4.5);
    }
  }

  private flushMission(): void {
    if (!this.mission) return;
    for (const e of this.mission.pending.splice(0)) this.sayEvent(e);
  }

  /** Everything the career screen needs to pay you. */
  summary(): FlightSummary {
    const m = this.mission?.mission ?? null;
    const run = this.mission;
    // heli hover medal check
    if (this.isHeli && this.heliHoverT > 19 && !this.events.has('heli_hover')) {
      this.events.add('heli_hover');
    }
    const survivedEmergency = this.events.has('emergency');
    return {
      mode: this.mode,
      aircraft: this.spec.id,
      weatherId: this.weather.id,
      missionTitleEn: m ? m.titleEn : null,
      missionTitleEs: m ? m.titleEs : null,
      missionRewardMoney: run ? run.totalMoney() : 0,
      missionRewardXp: m ? m.xp : 0,
      missionDone: run?.status === 'done',
      missionFailed: run?.status === 'failed' || (!!run && !this.alive),
      missionFailReason: run ? (run.failEn || this.crashReason) : '',
      score: this.score,
      distance: this.distance,
      seconds: this.flightTime,
      landings: this.landings,
      traps: this.traps,
      bestSink: this.bestLandingSink,
      cats: this.catLaunches,
      crashes: this.alive ? 0 : 1,
      maxG: this.maxG,
      maxMach: this.maxMach,
      night: this.nightFlight,
      minVis: this.minVis,
      maxIce: this.maxIce,
      maxCrosswind: this.maxCrosswind,
      assist: this.assist,
      events: Array.from(this.events),
      notes: this.notes,
      sarDropDist: (run as any)?.sarDropDist ?? null,
      lsoGrade: (this as any).lsoGrade || null,
      missionKind: m ? m.kind : null,
      emergencyKind: this.emergency ? this.emergency.kind : (survivedEmergency ? 'survived' : null),
      survivedEmergency,
      heliHover: this.heliHoverT,
      isHeli: this.isHeli,
    };
  }

  // ---------------------------------------------------------------- carrier hook
  private hookCheck(): void {
    if (!this.carrier || !this.alive) return;
    const s = this.spec;
    if (!s.carrier) return;
    const c = this.cEff();
    const cp = Math.cos(this.p);
    const sp = Math.sin(this.p);
    const hx = -s.hookX;
    const hy = -s.gearH + 0.1;
    const wx = this.x + (hx * cp - hy * sp) * c;
    const wy = this.y + hx * sp + hy * cp;
    const sRel = wx - this.carrier.x;
    const prev = this.prevHookS;
    this.prevHookS = sRel;
    if (prev === null || this.arrested || this.hookPos < 0.9 || this.hdg < 0 || this.turning) return;
    if (wy > DECK_H + 0.45 || wy < DECK_H - 2.6) return;
    if (sRel <= prev) return;
    for (let i = 0; i < WIRES.length; i++) {
      const wsr = WIRES[i];
      if (prev <= wsr && sRel >= wsr) {
        const uRel = this.u - this.carrier.vx;
        if (uRel < 8) return;
        this.arrested = true;
        this.wire = i;
        this.arrestDecel = clamp((uRel * uRel) / (2 * WIRE_RUNOUT), 6, 40);
        this.sinkRate = Math.max(0, -this.vy);
        this.grounded = true;
        this.vy = 0;
        this.autoThr = false;
        this.deckTouched = false;
        this.shake = 1;
        return;
      }
    }
  }

  private finishTrap(): void {
    this.trapped = true;
    this.traps++;
    const w = this.wire;
    // --- LSO grading: wire + glide + speed + lineup + sink
    // OLS error at trap (degrees), speed error (kts), lineup (m), sink (m/s)
    const glideErr = Math.abs(this.lsoHist.length ? this.lsoHist[this.lsoHist.length - 1].g : (this.olsError() ?? 0));
    const avg = this.lsoHist.length ? this.lsoHist.reduce((a, h) => ({ g: a.g + h.g, speedErr: a.speedErr + h.speedErr, line: a.line + h.line }), { g: 0, speedErr: 0, line: 0 }) : null;
    const avgGlide = avg ? Math.abs(avg.g / this.lsoHist.length) : glideErr;
    const avgSpeedErr = avg ? avg.speedErr / this.lsoHist.length : (this.ias * 1.944 - this.spec.vApproach * 1.944);
    const avgLine = avg ? avg.line / this.lsoHist.length : Math.abs(this.offset);
    const sink = this.sinkRate;
    // wire centrality: 3-wire (index 2) is ideal
    const wirePts = w === 2 ? 2 : w === 1 || w === 3 ? 1 : 0;
    // approach quality 0..6
    let app = 0;
    app += avgGlide < 0.55 ? 2 : avgGlide < 0.95 ? 1 : 0;
    app += Math.abs(avgSpeedErr) < 7 ? 2 : Math.abs(avgSpeedErr) < 13 ? 1 : 0;
    app += avgLine < 4 ? 2 : avgLine < 7.5 ? 1 : 0;
    if (sink > 6) app -= 2;
    else if (sink > 4.5) app -= 1;
    else if (sink < 2.6) app += 1;
    if (this.lsoWaveoff) app -= 2;
    const total = wirePts * 2 + app; // -4..10
    let grade = 'NO GRADE';
    let kind: Msg['kind'] = 'warn';
    let detail = `${Math.round(avgGlide*10)/10}° glideslope · ${Math.round(avgSpeedErr)} kt ${avgSpeedErr>0?'fast':'slow'} · ${avgLine.toFixed(1)} m lineup · ${sink.toFixed(1)} m/s`;
    if (this.lsoWaveoff) {
      grade = 'WAVEOFF';
      kind = 'bad';
      detail = t2('Unsafe approach', 'Aproximación insegura') + ' · ' + detail;
    } else if (total >= 8 && w === 2 && avgGlide < 0.7 && Math.abs(avgSpeedErr) < 9 && avgLine < 5 && sink < 4) {
      grade = 'PERFECT — OK 3-WIRE';
      kind = 'good';
    } else if (total >= 6 && w === 2) {
      grade = 'OK — 3-WIRE';
      kind = 'good';
    } else if (total >= 5) {
      grade = '(OK)';
      kind = 'good';
    } else if (total >= 3) {
      grade = 'FAIR';
      kind = 'info';
    } else if (total >= 1) {
      grade = 'NO GRADE';
      kind = 'warn';
    } else {
      grade = 'CUT PASS';
      kind = 'warn';
    }
    this.lsoGrade = grade;
    this.lsoDetail = detail;
    // keep classic pts for scoring compatibility ( map grade to pts)
    let pts = 2;
    if (grade.includes('PERFECT')) pts = 5;
    else if (grade === 'OK — 3-WIRE') pts = 4;
    else if (grade === '(OK)') pts = 3;
    else if (grade === 'FAIR') pts = 2;
    else if (grade === 'NO GRADE') pts = 1;
    else pts = 0;
    this.lastGrade = grade;
    const mult = this.comboMult();
    const score = Math.round(Math.max(0, pts) * 150 * mult);
    this.score += score;
    this.combo += 1;
    this.comboT = 0;
    if (pts >= 5) this.events.add('perfect_trap');
    const note: string[] = [detail];
    if (this.weather.wetness > 0.5) {
      note.push(t2('wet deck', 'cubierta mojada'));
      this.events.add('wet_trap');
    }
    if (this.wind.cross > 6) note.push(t2('crosswind', 'viento cruzado'));
    if (this.mission) {
      this.mission.onTrap(grade);
      this.flushMission();
    }
    this.say(
      t2(`TRAP! Wire #${w + 1}`, `¡ENGANCHADO! Cable nº${w + 1}`),
      kind,
      `${grade} · ${this.sinkRate.toFixed(1)} m/s${note.length ? ` · ${note.join(' · ')}` : ''} · +${score} · ${
        this.touch ? t2('CAT to relaunch', 'CATAP para relanzar') : t2('SPACE to relaunch', 'ESPACIO para relanzar')
      }`,
      8,
    );
  }

  olsError(): number | null {
    if (!this.carrier) return null;
    const s = this.spec;
    const tdX = this.carrier.x + WIRES[2];
    const hx = this.x - s.hookX * this.cEff();
    const d = tdX - hx;
    if (d < 40 || d > 4200 || this.hdg < 0) return null;
    const hy = this.y - s.gearH;
    const ideal = DECK_H + d * Math.tan((3.5 * Math.PI) / 180);
    return Math.atan2(hy - ideal, d) * (180 / Math.PI);
  }

  // ---------------------------------------------------------------- crash & wreck
  crash(reason: string, water: boolean): void {
    if (!this.alive) return;
    if (this.god) {
      // god mode: no death — a rescue puts you back on the runway / deck
      this.godSaves++;
      this.say(
        t2('GOD MODE', 'MODO DIOS'),
        'good',
        t2(`${reason} — rescued`, `${reason}: rescatado`),
        4,
      );
      this.respawn();
      return;
    }
    // gentle water ditch vs violent impact?
    let gentleWater = false;
    if (water) {
      const vVert = Math.abs(this.vy);
      const vHor = Math.abs(this.tas);
      const vOverall = Math.hypot(this.vy, this.u * 0.6);
      // gentle if low vertical + moderate speed and not already badly damaged
      gentleWater = vVert < 11 && vOverall < 38 && vHor < 90 && this.damage < 0.88;
    }
    this.alive = false;
    this.crashReason = gentleWater ? t2('Ditched in sea — sinking', 'Amerizaje — hundiéndose') : reason;
    this.shake = 1;
    this.hitFlash = gentleWater ? 0.25 : 1;
    this.throttle = 0;
    this.thrust = 0;
    if (this.mission && this.mission.status === 'active') {
      this.mission.status = 'failed';
      this.mission.failEn = this.crashReason;
      this.mission.failEs = this.crashReason;
      this.mission.endReason = gentleWater ? 'ditched' : 'crashed';
    }
    this.combo = 0;
    const sf = this.surfaceAt(this.x);
    const baseY = Math.max(this.y, sf.h);
    if (water) {
      if (gentleWater) {
        this.waterDitch = true;
        this.sinkT = 0;
        this.say(gentleWater ? t2('DITCHED — SINKING', 'AMERIZAJE — HUNDIÉNDOSE') : t2('CRASHED', 'ACCIDENTE'), gentleWater ? 'warn' : 'bad', gentleWater ? t2('Aircraft sinking — eject if needed', 'Avión hundiéndose — eyecta si es necesario') : reason, 6);
        for (let i = 0; i < 44; i++)
          this.addParticle('splash', this.x + (Math.random() - 0.5) * 12, sf.h, (Math.random() - 0.5) * 18, 3 + Math.random() * 12, 1.1 + Math.random(), 1.0, 0.8, [210, 235, 255]);
        for (let i = 0; i < 18; i++)
          this.addParticle('smoke', this.x + (Math.random() - 0.5) * 6, baseY + 0.4, (Math.random() - 0.5) * 3, 1 + Math.random() * 2, 2.2, 0.9, 0.9, [200, 215, 230]);
        this.vy = Math.min(this.vy, -0.4);
        this.u *= 0.45;
        return;
      }
      for (let i = 0; i < 70; i++)
        this.addParticle('splash', this.x + (Math.random() - 0.5) * 10, sf.h, (Math.random() - 0.5) * 30, 8 + Math.random() * 30, 1 + Math.random() * 1.5, 1.2, 1, [220, 240, 255]);
    }
    this.say(t2('CRASHED', 'ACCIDENTE'), 'bad', reason, 6);
    for (let i = 0; i < 80; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 4 + Math.random() * 30;
      this.addParticle('fire', this.x, baseY, Math.cos(a) * sp + this.worldVx * 0.3, Math.sin(a) * sp + 6, 0.8 + Math.random() * 1.6, 2 + Math.random() * 3, 5, [255, 170 + Math.random() * 60, 60]);
    }
    for (let i = 0; i < 60; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 2 + Math.random() * 14;
      this.addParticle('smoke', this.x, baseY, Math.cos(a) * sp, Math.sin(a) * sp + 8, 3 + Math.random() * 6, 3 + Math.random() * 4, 4, [40, 40, 44]);
    }
    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI;
      const sp = 8 + Math.random() * 40;
      this.addParticle('debris', this.x, baseY, Math.cos(a) * sp * (Math.random() < 0.5 ? -1 : 1) + this.worldVx * 0.4, Math.sin(a) * sp, 3 + Math.random() * 3, 0.5 + Math.random() * 0.9, 0, [90, 92, 100]);
    }
    this.vy = Math.max(this.vy, 0);
  }

  private wreck(h: number): void {
    if (this.waterDitch) {
      // sinking hull — gentle descent, bubbles, progressively deeper
      this.sinkT += h;
      // slow horizontal drift
      this.u *= 1 - 0.06 * h;
      this.vy -= 0.35 * G * h;
      this.vy = clamp(this.vy, -1.9, 0.3);
      this.x += this.u * this.cEff() * h;
      this.y += this.vy * h;
      const sf = this.surfaceAt(this.x);
      // splash/bubbles while going under
      if (this.y < sf.h + 0.35 && this.y > sf.h - 8) {
        if (Math.random() < 0.18) this.addParticle('splash', this.x + (Math.random() - 0.5) * 5, sf.h, (Math.random() - 0.5) * 3, 0.8 + Math.random() * 1.2, 0.9, 0.55, 0.7, [185, 210, 240]);
        if (Math.random() < 0.15) this.addParticle('smoke', this.x + (Math.random() - 0.5) * 3, Math.max(this.y, sf.h - 0.8), (Math.random() - 0.5) * 0.9, 1.2 + Math.random() * 1.2, 1.8, 0.7, 0.6, [175, 210, 240]);
      }
      // keep it just under the surface for the first ~3.5 s so the splash is readable,
      // then let it sink progressively deeper (target descends with sinkT)
      if (this.y < sf.h - 0.35) {
        const depthProgress = clamp((this.sinkT - 1.2) / 9, 0, 1); // 0→1 over ~9 s after first dip
        const bob = Math.sin(this.sinkT * 1.05) * 0.14;
        const target = sf.h - 0.65 - depthProgress * 4.2 + bob; // -0.65 → -4.85 m
        this.y += (target - this.y) * 0.045;
        this.vy *= 0.94;
        if (this.y < sf.h - 5.8) this.y = sf.h - 5.8;
      } else if (this.y > sf.h - 0.35 && this.y < sf.h + 0.7) {
        // just above / touching the water — slip under gently
        this.y = Math.min(this.y - 0.04, sf.h - 0.18);
        this.vy = Math.min(this.vy, -0.28);
      }
      return;
    }
    this.vy -= G * h;
    this.u *= 1 - 0.4 * h;
    this.x += this.u * this.cEff() * h;
    this.y += this.vy * h;
    const sf = this.surfaceAt(this.x);
    if (this.y - 0.8 < sf.h) {
      this.y = sf.h + 0.8;
      this.vy = 0;
      this.u *= 1 - 3 * h;
    }
  }

  // ---------------------------------------------------------------- particles
  addParticle(kind: Particle['kind'], x: number, y: number, vx: number, vy: number, life: number, size: number, grow: number, col: [number, number, number]): void {
    if (this.particles.length > 900) return;
    this.particles.push({ x, y, vx, vy, life, max: life, size, grow, kind, col, rot: Math.random() * 6.28, vr: (Math.random() - 0.5) * 8 });
  }

  private updateParticles(dt: number): void {
    const out: Particle[] = [];
    for (const p of this.particles) {
      p.life -= dt;
      if (p.life <= 0) continue;
      p.x += (p.vx - (p.kind === 'trail' ? 0 : 0)) * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
      p.rot += p.vr * dt;
      if (p.kind === 'smoke') {
        p.vy += 2.5 * dt;
        p.vx *= 1 - 0.6 * dt;
      } else if (p.kind === 'fire') {
        p.vy += 3 * dt;
        p.vx *= 1 - 1.2 * dt;
      } else if (p.kind === 'debris' || p.kind === 'splash' || p.kind === 'spark') {
        p.vy -= G * dt * (p.kind === 'spark' ? 1.2 : 1);
        if (p.kind !== 'splash') {
          const g = Math.max(this.surfaceAt(p.x).h, 0);
          if (p.y < g) {
            p.y = g;
            p.vy = Math.abs(p.vy) * 0.3;
            p.vx *= 0.6;
          }
        }
      } else if (p.kind === 'dust') {
        p.vy += 0.5 * dt;
        p.vx *= 1 - 0.8 * dt;
      } else if (p.kind === 'trail') {
        p.vx *= 1 - 0.4 * dt;
      }
      out.push(p);
    }
    this.particles = out;
  }

  private emitEffects(dt: number): void {
    if (!this.alive) {
      // burning wreck
      this.emitAcc += dt;
      while (this.emitAcc > 0.04) {
        this.emitAcc -= 0.04;
        const sf = this.surfaceAt(this.x);
        if (sf.kind === 'water') continue;
        this.addParticle('smoke', this.x + (Math.random() - 0.5) * 6, this.y, (Math.random() - 0.5) * 3, 5 + Math.random() * 4, 5, 2.5, 3.5, [30, 30, 34]);
        if (Math.random() < 0.6) this.addParticle('fire', this.x + (Math.random() - 0.5) * 6, this.y, (Math.random() - 0.5) * 3, 3 + Math.random() * 4, 0.7, 1.8, 2, [255, 150 + Math.random() * 80, 40]);
      }
      return;
    }
    const s = this.spec;
    this.emitAcc += dt;
    const c = this.cEff();
    const cp = Math.cos(this.p);
    const sp = Math.sin(this.p);
    while (this.emitAcc > 0.03) {
      this.emitAcc -= 0.03;
      const tx = this.x + (-s.length * 0.52 * cp) * c;
      const ty = this.y - s.length * 0.52 * sp;
      const vxw = this.worldVx;
      // contrails
      if (s.kind === 'jet' && this.y > 6500 && this.thrust > 0.3) {
        this.addParticle('trail', tx, ty, vxw * 0.0, 0, 9, 1.2, 1.6, [255, 255, 255]);
      }
      // wingtip vortices
      if (!this.grounded && this.g > 4.2 && this.tas > 90) {
        this.addParticle('trail', this.x - c * 1.5, this.y - 0.2, 0, 0, 1.6, 0.35, 0.8, [255, 255, 255]);
      }
      // aerobatic smoke: a colour trail from the tail. Only aircraft with
      // display smoke (PC-21: red/yellow bands) can switch it on — see toggleSmoke.
      if (this.smokeOn && s.displaySmoke) {
        this.smokeT += 0.03;
        let col: [number, number, number];
        if (s.smokeColors && s.smokeColors.length > 0) {
          const band = Math.floor(this.smokeT / 1.1) % s.smokeColors.length;
          col = s.smokeColors[band];
        } else {
          const hue = (this.smokeT * 60) % 360;
          col = hslToRgb(hue / 360, 0.85, 0.6);
        }
        this.addParticle('smoke', tx, ty, -c * 1.5, 0.2, 2.4, 0.5, 2.6, col);
      }
      // exhaust haze
      if (s.kind === 'prop' && this.thrust > 0.7 && Math.random() < 0.4) {
        this.addParticle('smoke', tx, ty, -c * 4, 0.5, 1.2, 0.35, 1.5, [140, 140, 140]);
      }
      if (s.kind === 'jet' && this.thrust > 0.9 && this.grounded && Math.abs(this.u) < 30 && Math.random() < 0.6) {
        this.addParticle('dust', tx - c * 2, this.groundH + 0.5, -c * (4 + Math.random() * 14), 1 + Math.random() * 2, 1.6, 1.4, 3, [200, 195, 180]);
      }
      // dust from the wheels
      if (this.grounded && !this.belly && Math.abs(this.u) > 12) {
        const sf = this.surfaceAt(this.x);
        if (sf.kind === 'grass' || sf.kind === 'sand' || sf.kind === 'rock') {
          this.addParticle('dust', this.x + s.mainX * c, sf.h + 0.3, -c * 3 + (Math.random() - 0.5) * 2, 1 + Math.random() * 2, 1.4, 0.8, 2.5, sf.kind === 'sand' ? [214, 196, 150] : [140, 120, 90]);
        }
      }
      if (this.grounded && this.belly && Math.abs(this.u) > 4) {
        this.addParticle('spark', this.x, this.groundH + 0.3, -c * 8 * Math.random(), 2 + Math.random() * 6, 0.5, 0.22, 0, [255, 190, 80]);
        this.addParticle('smoke', this.x, this.groundH + 0.4, -c * 2, 1, 1.5, 0.8, 2, [90, 90, 90]);
      }
      if (this.grounded && this.arrested && !this.trapped) {
        this.addParticle('spark', this.x + this.spec.mainX, this.groundH + 0.3, -3 * Math.random(), 1 + Math.random() * 4, 0.4, 0.2, 0, [255, 210, 120]);
      }
    }
  }

  // misc helper for HUD
  hashSeed(n: number): number {
    return hash(n);
  }
}
