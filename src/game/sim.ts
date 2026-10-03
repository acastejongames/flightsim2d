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

export class Sim {
  spec: AircraftSpec;
  mode: WorldMode;
  tod: TimeOfDay;
  startAir: boolean;
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
  flaps = 0;
  flapPos = 0;
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

  // ---- sandbox / free play
  sandbox: SandboxTune | null = null;
  /** how many times god mode has rescued the pilot */
  godSaves = 0;

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
    this.weather = new Weather(s.weather, s.mode);
    if (s.sandbox) this.setSandbox(s.sandbox, true);
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
            ? t2(
                'Press X (or hold →) for full throttle, then SPACE to launch from the catapult',
                'Pulsa X (o mantén →) a tope y luego ESPACIO para lanzarte de la catapulta',
              )
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

  surfaceAt(x: number): Surface {
    if (this.carrier) {
      const s = x - this.carrier.x;
      if (s >= 0 && s <= CARRIER_LEN) return { h: DECK_H, kind: 'deck', vx: this.carrier.vx };
    }
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
    this.flaps = 0;
    this.flapPos = 0;
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
    this.engineOut = false;
    this.lowFuelSaid = false;
    this.autoThr = false;
    this.trimOff = 0;
    this.particles = [];
    this.shake = 0;
    this.stallWarn = 0;
    this.lastGrade = '';
    this.offset = 0;
    this.rudder = 0;
    this.ice = 0;
    this.damage = 0;
    this.crab = 0;
    this.excursionTimer = 0;
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
        this.throttle = 0.6;
        this.thrust = 0.6;
      } else {
        this.x = ap.x - ap.len / 2 + 90;
        this.y = ap.elev + s.gearH;
      }
    }
    this.msgs = [];
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
      this.say('Hook raised — wire released', 'info', 'Taxi clear. Press R to return to the catapult', 3);
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
    this.say(this.autoThr ? `Autothrottle ON — ${Math.round(this.atTarget * 1.944)} kt` : 'Autothrottle OFF', 'info', this.autoThr ? '← → adjust speed' : '', 2.2);
  }

  trim(d: number): void {
    this.trimOff = clamp(this.trimOff + d * 0.012, -0.25, 0.25);
  }

  startTurn(): void {
    if (!this.alive || this.turning) return;
    if (this.grounded) {
      if (this.carrier && this.surfaceAt(this.x).kind === 'deck') return this.say('Cannot turn around on the flight deck', 'warn');
      if (Math.abs(this.u) > 3) return this.say('Stop before turning around', 'warn');
      this.turning = true;
      this.turnKind = 'ground';
      this.turnT = 0;
      this.turnDur = 1.4;
      this.u = 0;
      return;
    }
    if (this.ias < 1.25 * this.spec.vs) return this.say('Too slow to turn — add speed', 'warn');
    if (Math.cos(this.p) < 0.5) return this.say('Level out before turning', 'warn');
    this.turning = true;
    this.turnKind = 'air';
    this.turnT = 0;
    this.turnDur = 2.8;
  }

  launch(): void {
    if (!this.alive) return;
    if (!this.carrier) return;
    if (this.trapped || (this.arrested && this.u - this.carrier.vx * this.hdg < 0.5)) return this.respawn();
    if (!this.catHeld) return this.say('Not on the catapult — press R to reposition', 'info');
    if (this.throttle < 0.85) return this.say('Set throttle to FULL before launch', 'warn', 'Hold → until the bar is full');
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
    for (const m of this.msgs) m.t += dt;
    this.msgs = this.msgs.filter((m) => m.t < m.dur);
    this.shake = Math.max(0, this.shake - dt * 1.5);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 2);
    const sf = this.surfaceAt(this.x);
    this.groundH = sf.h;
    this.agl = this.y - (this.gear > 0.9 ? s.gearH : s.gearH * 0.4) - sf.h;
    this.maxAlt = Math.max(this.maxAlt, this.y);
    if (this.alive) {
      this.flightTime += dt;
      this.distance += Math.abs(this.worldVx) * dt;
      // terrain proximity warning
      let warn = false;
      if (!this.grounded) {
        const vxw = this.worldVx;
        for (let t = 1.5; t <= 7; t += 1.5) {
          const px = this.x + vxw * t;
          const py = this.y + this.vy * t;
          const g = Math.max(terrainHeight(px, this.mode), 0);
          if (py < g + 25 && this.vy < -2) warn = true;
        }
        const landingCfg = this.gear > 0.9 && this.flapPos > 0.5;
        if (landingCfg && this.agl < 400) warn = warn && this.vy < -8;
      }
      this.pullUp = warn;
      this.refuelTick(dt);
    }
    this.updateParticles(dt);
    this.emitEffects(dt);
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
    const rate = Math.abs(inp.pitch) > 0.01 ? 3 : 4;
    this.elev += clamp(inp.pitch - this.elev, -rate * h, rate * h);

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
    let Cd = s.Cd0 + s.flapCd * this.flapPos + s.gearCd * this.gear + 0.045 * this.airbrake;
    Cd += 0.026 * ice * (1 - (s.deIce ?? 0) * 0.5) * 2.2 + ice * 0.012;
    if (s.kind === 'jet') {
      Cd += 0.026 * smoothstep(0.88, 1.08, mach) + 0.012 * Math.exp(-Math.pow((mach - 1.05) / 0.12, 2));
    } else if (mach > 0.65) Cd += 1.5 * Math.pow(mach - 0.65, 2);
    Cd += s.k * lc.cl * lc.cl + 1.4 * lc.stall * Math.sin(alpha) * Math.sin(alpha) + 0.25 * Math.sin(alpha) * Math.sin(alpha);

    const Lraw = q * s.S * lc.cl;
    const L = Lraw * cosB;
    const D = q * s.S * Cd;

    let T = 0;
    const dens = rho / 1.225;
    if (s.kind === 'prop') {
      const lapse = Math.pow(dens, 0.8);
      T = this.thrust * Math.min(s.thrustStatic * dens, (s.propEff * s.power * lapse) / Math.max(V, 14));
    } else {
      const t = this.thrust;
      const frac = t <= 0.85 ? t / 0.85 : 1 + ((t - 0.85) / 0.15) * (s.thrustAB / s.thrustMil - 1);
      const idle = this.fuel > 0 && !this.engineOut ? 0.03 : 0;
      T = s.thrustMil * (idle + frac) * Math.pow(dens, 0.85) * (1 + 0.3 * Math.min(mach, 1.8));
    }

    const sg = Math.sin(gamma);
    const cg = Math.cos(gamma);
    const Fx = T * Math.cos(this.p) - L * sg - D * cg;
    const Fy = T * Math.sin(this.p) + L * cg - D * sg;

    this.g = this.grounded ? 1 : Lraw / (m * G);
    this.stallWarn = alpha > 0.88 * aStall && alpha < 2 && !this.grounded ? 1 : 0;
    this.overspeed = this.ias > s.vne || (s.kind === 'jet' && mach > 2.0);
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
    this.u += (A.Fx / m) * h;
    this.vy += (A.Fy / m - G) * h;

    const bank = this.turning && this.turnKind === 'air' ? 1.0 * Math.sin(Math.PI * this.turnT) : 0;
    const cosB = Math.cos(bank);
    const a0 = s.alpha0 - 0.05 * this.flapPos;
    const qq = Math.max(q, 1);
    const W = m * G;
    const qf = Math.max(q / (q + 0.5 * 1.225 * Math.pow(0.8 * s.vs, 2)), 0.05);
    const Kq = s.pitchK * qf;
    const Cq = 1.7 * Math.sqrt(Kq) + 0.25;

    let aTrim: number;
    if (this.assist) aTrim = a0 + (W * Math.cos(gamma)) / (qq * s.S * cosB) / s.CLa;
    else aTrim = s.alpha0 + 0.5 * (s.alphaStall - s.alpha0) + this.trimOff;
    if (this.assist && Math.cos(gamma) > 0.1) aTrim -= 0.18 * clamp(gamma, -0.9, 0.9);
    aTrim = clamp(aTrim, -0.85 * s.alphaStall, 0.85 * s.alphaStall);

    const e = this.elev;
    let aCmd = e >= 0 ? aTrim + e * (1.18 * s.alphaStall - aTrim) : aTrim + e * (aTrim + 0.55 * s.alphaStall);
    const aMaxG = a0 + (s.gmax * W) / (qq * s.S) / s.CLa;
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
    if (this.g > s.gmax * 1.04) this.damage += (this.g - s.gmax * 1.04) * 0.1 * h;
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
    let mu = this.belly || !gearDown ? 0.5 : 0.03;
    if (gearDown) {
      if (surf.kind === 'grass') mu = 0.07;
      else if (surf.kind === 'sand' || surf.kind === 'snow') mu = 0.12;
      else if (surf.kind === 'rock') mu = 0.2;
      if (braking) mu = 0.55 * (s.brakeBonus ?? 1);
    }
    const hydroplaning = wet > 0.45 && Math.abs(uRel) > 40 ? 0.32 : 1;
    mu *= (1 - 0.42 * wet) * hydroplaning;
    const normal = Math.max(0, G - A.L / A.m);
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
    if (liftNet > 0.1 * A.m * G && !this.catActive && !this.catHeld && !this.arrested && this.p > beta + 0.015 && !this.belly) {
      this.grounded = false;
      this.airTime = 0;
      this.vy = Math.max(this.vy, 0.4);
      this.y += 0.05;
      if (this.deckTouched && this.carrier) {
        this.deckTouched = false;
        this.say('BOLTER!', 'warn', 'Full power — go around', 3);
      } else if (this.airTime === 0 && Math.abs(this.u) > s.vs * 0.6) {
        this.say('Airborne', 'info', '', 1.4);
      }
      return;
    }
    this.vy = clamp((newY - this.y) / h, -6, 6);
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
    let pts = w === 2 ? 4 : w === 1 || w === 3 ? 3 : 2;
    if (this.sinkRate > 5) pts -= 1;
    if (this.sinkRate < 2.2 && w === 2) pts = 5;
    let grade = 'NO GRADE';
    let kind: Msg['kind'] = 'warn';
    if (pts >= 5) {
      grade = 'PERFECT — OK 3-WIRE';
      kind = 'good';
    } else if (pts === 4) {
      grade = 'OK — 3-WIRE';
      kind = 'good';
    } else if (pts === 3) {
      grade = '(OK)';
      kind = 'good';
    } else if (pts === 2) {
      grade = 'FAIR';
      kind = 'info';
    }
    this.lastGrade = grade;
    const mult = this.comboMult();
    const score = Math.round(Math.max(0, pts) * 150 * mult);
    this.score += score;
    this.combo += 1;
    this.comboT = 0;
    if (pts >= 5) this.events.add('perfect_trap');
    const note: string[] = [];
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
      `${grade} · ${this.sinkRate.toFixed(1)} m/s${note.length ? ` · ${note.join(' · ')}` : ''} · +${score} · ${t2('SPACE to relaunch', 'ESPACIO para relanzar')}`,
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
    this.alive = false;
    this.crashReason = reason;
    this.shake = 1;
    this.hitFlash = 1;
    this.throttle = 0;
    this.thrust = 0;
    if (this.mission && this.mission.status === 'active') {
      this.mission.status = 'failed';
      this.mission.failEn = reason;
      this.mission.failEs = reason;
      this.mission.endReason = 'crashed';
    }
    this.combo = 0;
    this.say(t2('CRASHED', 'ACCIDENTE'), 'bad', reason, 6);
    const sf = this.surfaceAt(this.x);
    const baseY = Math.max(this.y, sf.h);
    if (water) {
      for (let i = 0; i < 70; i++)
        this.addParticle('splash', this.x + (Math.random() - 0.5) * 10, sf.h, (Math.random() - 0.5) * 30, 8 + Math.random() * 30, 1 + Math.random() * 1.5, 1.2, 1, [220, 240, 255]);
    }
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
