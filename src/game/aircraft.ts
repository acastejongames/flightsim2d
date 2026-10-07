export type AircraftId = 'pc21' | 'cn235' | 'cn235mpa' | 'ef18' | 'typhoon' | 'aw139';

/**
 * A hand-drawn side view used instead of the procedural renderer.
 * All the numbers are metres relative to the aircraft origin (+x forward, +y up).
 */
export interface SpriteDef {
  src: string;
  xmin: number;
  xmax: number;
  ymin: number;
  ymax: number;
  /** retractable gear: pivot on the airframe, leg length and wheel radius */
  nose: { x: number; pivotY: number; legLen: number; wheelR: number };
  main: { x: number; pivotY: number; legLen: number; wheelR: number };
  /** engine markers: afterburner plumes on jets, propeller discs on props */
  engines: { x: number; y: number; r: number }[];
  /**
   * External lights, in the same metre frame as the artwork: navigation
   * (red wingtip, white tail), anti-collision beacon on the spine, white
   * strobes (wingtip + tail) and the runway/landing light at the nose.
   */
  lights?: {
    nav: { x: number; y: number };
    tail: { x: number; y: number };
    beacon: { x: number; y: number };
    rwy: { x: number; y: number };
  };
}

export interface AircraftSpec {
  id: AircraftId;
  name: string;
  role: string;
  desc: string;
  kind: 'prop' | 'jet' | 'heli';
  carrier: boolean;
  fixedGear: boolean;
  // mass (kg)
  emptyMass: number;
  fuelMax: number;
  // aerodynamics
  S: number;
  CLa: number;
  alpha0: number;
  alphaStall: number;
  Cd0: number;
  k: number;
  flapCd: number;
  gearCd: number;
  // propulsion
  power: number;
  propEff: number;
  thrustStatic: number;
  thrustMil: number;
  thrustAB: number;
  spool: number;
  fuelIdle: number;
  fuelMil: number;
  fuelAB: number;
  // limits
  gmax: number;
  /** max commanded pull alpha (rad) — fighters allow post-stall supermanoeuvres like the Cobra; default 1.18·alphaStall */
  alphaMax?: number;
  /** supersonic wave-drag factor (jets) — slender deltas score below 1; default 1 */
  waveCd?: number;
  /** max operating Mach (jets) — overspeed past this; default 2.0 */
  mmo?: number;
  /** min sustained turn rate (rad/s) for fighters — the g-limiter opens up with speed so the jet still carves at Mach; default 0 (pure g-limit) */
  minTurnRate?: number;
  gmin: number;
  vne: number;
  // geometry (m)
  length: number;
  gearH: number;
  mainX: number;
  noseX: number;
  tailAngle: number;
  hookX: number;
  propR: number;
  // handling
  pitchK: number;
  /**
   * Control sensitivity multiplier: >1 for fighters (crisp, evasive pitch and
   * fast reversals), <1 for heavy transports. Defaults to 1.
   */
  sens?: number;
  /**
   * Fighters work their oleos over taxiway joints while rolling slowly off
   * the chocks — transports roll smooth. Visual only.
   */
  taxiBounce?: boolean;
  /** wheel-brake strength multiplier (default 1 — fighters stop harder) */
  brakePower?: number;
  vs: number;
  vApproach: number;
  vRotate: number;
  vCruise: number;
  catSpeed: number;
  launchPitch: number;
  maxSink: number;
  // career upgrade effects (optional, filled in by applyUpgrades)
  brakeBonus?: number;
  deIce?: number;
  radarKm?: number;
  turbDamp?: number;
  gearTol?: number;
  navAssist?: boolean;
  upgraded?: boolean;
  /** optional hand-drawn sprite (see SpriteDef) */
  sprite?: SpriteDef;
  /** aerobatic smoke palette: the trail alternates between these RGB colours (default is a rainbow cycle) */
  smokeColors?: [number, number, number][];
  /** display smoke equipped: only these aircraft can toggle the aerobatic trail */
  displaySmoke?: boolean;
  // menu stats 0..1
  stats: { speed: number; climb: number; agility: number; range: number };
}

export const AIRCRAFT: AircraftSpec[] = [
  {
    id: 'ef18',
    name: 'Boeing EF-18M',
    role: 'Air Force fighter-bomber',
    desc: 'The Spanish Air Force Hornet: twin tails, two afterburners and a hook for emergency arrestor landings. Very sensitive controls — point it and it goes.',
    kind: 'jet',
    carrier: true,
    fixedGear: false,
    taxiBounce: true,
    brakePower: 1.35,
    emptyMass: 11500,
    fuelMax: 4900,
    S: 38,
    CLa: 4.1,
    alpha0: -0.018,
    alphaStall: 0.46,
    Cd0: 0.019,
    k: 0.08,
    flapCd: 0.017,
    gearCd: 0.017,
    power: 0,
    propEff: 0,
    thrustStatic: 0,
    thrustMil: 108000,
    thrustAB: 184000,
    spool: 1.0,
    fuelIdle: 0.32,
    fuelMil: 2.5,
    fuelAB: 8.2,
    gmax: 9,
    alphaMax: 1.6,
    mmo: 1.8,
    minTurnRate: 0.7,
    gmin: 3.5,
    vne: 590,
    length: 17.07,
    gearH: 2.2,
    mainX: -0.5,
    noseX: 6.3,
    tailAngle: 0.24,
    hookX: 6.6,
    propR: 0,
    pitchK: 12,
    sens: 1.4,
    vs: 62,
    vApproach: 68,
    vRotate: 72,
    vCruise: 240,
    catSpeed: 72,
    launchPitch: 0.13,
    maxSink: 7.4,
    stats: { speed: 0.98, climb: 0.92, agility: 0.9, range: 0.5 },
    sprite: {
      src: 'images/ef18.png',
      xmin: -6.83,
      xmax: 10.24,
      ymin: -0.88,
      ymax: 2.9,
      nose: { x: 6.3, pivotY: -0.25, legLen: 1.63, wheelR: 0.32 },
      main: { x: -0.5, pivotY: -0.4, legLen: 1.48, wheelR: 0.32 },
      engines: [
        { x: -6.45, y: 0.16, r: 0.42 },
        { x: -6.35, y: -0.12, r: 0.42 },
      ],
      lights: {
        nav: { x: -1.1, y: 0.15 },
        tail: { x: -6.7, y: 2.7 },
        beacon: { x: -3.6, y: 0.95 },
        rwy: { x: 6.3, y: -1.1 },
      },
    },
  },
  {
    id: 'pc21',
    name: 'Pilatus PC-21',
    role: 'Advanced trainer',
    desc: 'The Air Force advanced trainer: turbine power, a five-blade prop and a glass cockpit. Fast for a prop, forgiving and cheap to run.',
    kind: 'prop',
    carrier: false,
    fixedGear: false,
    emptyMass: 2300,
    fuelMax: 500,
    S: 15.0,
    CLa: 4.7,
    alpha0: -0.03,
    alphaStall: 0.3,
    Cd0: 0.024,
    k: 0.06,
    flapCd: 0.02,
    gearCd: 0.013,
    power: 1850000,
    propEff: 0.85,
    thrustStatic: 16000,
    thrustMil: 0,
    thrustAB: 0,
    spool: 0.45,
    fuelIdle: 0.03,
    fuelMil: 0.16,
    fuelAB: 0,
    gmax: 8,
    alphaMax: 0.85,
    gmin: 3,
    vne: 205,
    length: 11.23,
    gearH: 1.5,
    mainX: -0.1,
    noseX: 4.5,
    tailAngle: 0.2,
    hookX: 0,
    propR: 1.2,
    pitchK: 8.5,
    sens: 1.15,
    vs: 32,
    vApproach: 36,
    vRotate: 36,
    vCruise: 105,
    catSpeed: 0,
    launchPitch: 0,
    maxSink: 3.8,
      stats: { speed: 0.55, climb: 0.6, agility: 0.75, range: 0.7 },
      displaySmoke: true,
      // display smoke in the national colours: red and yellow, like the display teams
      smokeColors: [
        [214, 32, 44],
        [255, 196, 0],
      ],
    sprite: {
      src: 'images/pc21.png',
      xmin: -5.05,
      xmax: 6.18,
      ymin: -0.84,
      ymax: 2.62,
      nose: { x: 4.5, pivotY: -0.44, legLen: 0.84, wheelR: 0.22 },
      main: { x: -0.1, pivotY: -0.46, legLen: 0.82, wheelR: 0.22 },
      engines: [{ x: 5.35, y: 0.28, r: 1.3 }],
      lights: {
        nav: { x: -4.35, y: 0.3 },
        tail: { x: -4.6, y: 0.85 },
        beacon: { x: 0.3, y: 1.02 },
        rwy: { x: 4.5, y: -0.8 },
      },
    },
  },
  {
    id: 'cn235',
    name: 'CASA CN-235',
    role: 'Tactical transport',
    desc: 'Twin-turboprop tactical airlifter with a rear ramp. Heavy and stately: take off with flaps, give yourself room to descend and start the flare early.',
    kind: 'prop',
    carrier: false,
    fixedGear: false,
    emptyMass: 7800,
    fuelMax: 2200,
    S: 59,
    CLa: 4.8,
    alpha0: -0.02,
    alphaStall: 0.32,
    Cd0: 0.028,
    k: 0.05,
    flapCd: 0.028,
    gearCd: 0.02,
    power: 2700000,
    propEff: 0.84,
    thrustStatic: 30000,
    thrustMil: 0,
    thrustAB: 0,
    spool: 0.7,
    fuelIdle: 0.06,
    fuelMil: 0.34,
    fuelAB: 0,
    gmax: 3.2,
    gmin: 2,
    vne: 185,
    length: 21.4,
    // short-legged airlifter: the belly sits close to the ground
    gearH: 2.05,
    // wheels hang from the bays drawn in the artwork: mains in the belly
    // sponson, nose gear under the cockpit
    mainX: 3.2,
    noseX: 8.0,
    tailAngle: 0.22,
    hookX: 0,
    propR: 1.9,
    pitchK: 6.2,
    sens: 0.72,
    vs: 40,
    vApproach: 56,
    vRotate: 50,
    vCruise: 118,
    catSpeed: 0,
    launchPitch: 0,
    maxSink: 4.2,
    stats: { speed: 0.5, climb: 0.4, agility: 0.3, range: 1 },
    sprite: {
      src: 'images/cn235.png',
      xmin: -9.63,
      xmax: 11.77,
      ymin: -1.26,
      ymax: 6.66,
      // the legs start inside the belly and only the wheel shows below the
      // sponson, so the transport never looks like it is on stilts
      nose: { x: 8.0, pivotY: -0.5, legLen: 1.25, wheelR: 0.3 },
      main: { x: 3.2, pivotY: -0.55, legLen: 1.2, wheelR: 0.3 },
      engines: [{ x: 4.72, y: 1.6, r: 1.85 }],
      lights: {
        nav: { x: -2.6, y: 1.9 },
        tail: { x: -8.35, y: 3.2 },
        beacon: { x: 3.0, y: 2.25 },
        rwy: { x: 8.0, y: -1.1 },
      },
    },
  },
  {
    id: 'cn235mpa',
    name: 'CASA CN-235 MPA',
    role: 'Maritime patrol & rescue',
    desc: 'Salvamento Maritimo search-and-rescue variant: belly search radar, extra crew and mission kit. Same honest handling as the airlifter, with the endurance for a long patrol.',
    kind: 'prop',
    carrier: false,
    fixedGear: false,
    // +300 kg of mission kit over the airlifter
    emptyMass: 8100,
    fuelMax: 2200,
    S: 59,
    CLa: 4.8,
    alpha0: -0.02,
    alphaStall: 0.32,
    // the belly radome costs a little drag
    Cd0: 0.029,
    k: 0.05,
    flapCd: 0.028,
    gearCd: 0.02,
    power: 2700000,
    propEff: 0.84,
    thrustStatic: 30000,
    thrustMil: 0,
    thrustAB: 0,
    spool: 0.7,
    fuelIdle: 0.06,
    fuelMil: 0.34,
    fuelAB: 0,
    gmax: 3.2,
    gmin: 2,
    vne: 185,
    length: 21.4,
    gearH: 2.05,
    mainX: 3.2,
    noseX: 8.0,
    tailAngle: 0.22,
    hookX: 0,
    propR: 1.9,
    pitchK: 6.2,
    sens: 0.72,
    vs: 40,
    vApproach: 56,
    vRotate: 50,
    vCruise: 118,
    catSpeed: 0,
    launchPitch: 0,
    maxSink: 4.2,
    stats: { speed: 0.5, climb: 0.38, agility: 0.3, range: 1 },
    sprite: {
      src: 'images/cn235mpa.png',
      // same physical airframe as the airlifter: identical gear, engine and
      // light stations, canvas bounds re-anchored to the new artwork
      xmin: -9.65,
      xmax: 11.778,
      ymin: -1.237,
      ymax: 6.689,
      nose: { x: 8.0, pivotY: -0.5, legLen: 1.25, wheelR: 0.3 },
      main: { x: 3.2, pivotY: -0.55, legLen: 1.2, wheelR: 0.3 },
      engines: [{ x: 4.72, y: 1.6, r: 1.85 }],
      lights: {
        nav: { x: -2.6, y: 1.9 },
        tail: { x: -8.35, y: 3.2 },
        beacon: { x: 3.0, y: 2.25 },
        rwy: { x: 8.0, y: -1.1 },
      },
    },
  },
  {
    id: 'typhoon',
    name: 'Typhoon C.16',
    taxiBounce: true,
    brakePower: 1.35,
    role: 'Delta-canard interceptor',
    desc: 'Spanish single-seat delta canard: Mach 2, endless energy in a turn and a hot afterburner. Land-based — no tailhook — and it floats on landing, so bring the gear down early.',
    kind: 'jet',
    carrier: false,
    fixedGear: false,
    emptyMass: 11000,
    fuelMax: 4000,
    S: 51.2,
    CLa: 4.0,
    alpha0: -0.015,
    alphaStall: 0.44,
    Cd0: 0.016,
    k: 0.07,
    flapCd: 0.018,
    gearCd: 0.016,
    power: 0,
    propEff: 0,
    thrustStatic: 0,
    thrustMil: 96000,
    thrustAB: 220000,
    spool: 1.1,
    fuelIdle: 0.28,
    fuelMil: 2.3,
    fuelAB: 8.4,
    gmax: 9.5,
    alphaMax: 1.6,
    waveCd: 0.28,
    mmo: 2.3,
    minTurnRate: 0.7,
    gmin: 3.5,
    vne: 640,
    length: 15.96,
    gearH: 2.35,
    mainX: -0.5,
    noseX: 4.6,
    tailAngle: 0.28,
    hookX: 0,
    propR: 0,
    pitchK: 13,
    sens: 1.45,
    vs: 62,
    vApproach: 66,
    vRotate: 72,
    vCruise: 250,
    catSpeed: 0,
    launchPitch: 0.13,
    maxSink: 7,
    stats: { speed: 1, climb: 1, agility: 0.92, range: 0.45 },
    sprite: {
      src: 'images/typhoon.png',
      // measured from the artwork: 1251 px across = 15.96 m, origin 47% back from the nose
      xmin: -8.46,
      xmax: 7.5,
      ymin: -1.52,
      ymax: 3.29,
      // pivots sit inside the airframe, legs reach the ground at -gearH
      nose: { x: 4.6, pivotY: -0.3, legLen: 1.75, wheelR: 0.3 },
      main: { x: -0.5, pivotY: -0.9, legLen: 1.1, wheelR: 0.35 },
      engines: [{ x: -7.0, y: -0.45, r: 0.6 }],
      lights: {
        nav: { x: -3.1, y: -0.85 },
        tail: { x: -6.6, y: 2.52 },
        beacon: { x: -1.4, y: 0.7 },
        rwy: { x: 4.6, y: -1.2 },
      },
    },
  },
  {
    id: 'aw139',
    name: 'Leonardo AW139',
    role: 'SAR helicopter — Salvamento Marítimo',
    desc: 'Helicóptero medio de Salvamento Marítimo EC-LCH 204 (SASEMAR). Dos PT6, rotor de 13.8 m y capacidad VTOL: despega vertical, planea a baja cota y rescata en el mar. Vuela bajo y lento para el rescate.',
    kind: 'heli',
    carrier: false,
    fixedGear: false,
    emptyMass: 3680,
    fuelMax: 1050,
    S: 28,
    CLa: 2.8,
    alpha0: 0,
    alphaStall: 0.45,
    Cd0: 0.032,
    k: 0.06,
    flapCd: 0,
    gearCd: 0.018,
    power: 3100000,
    propEff: 0.78,
    thrustStatic: 68000,
    thrustMil: 0,
    thrustAB: 0,
    spool: 0.85,
    fuelIdle: 0.07,
    fuelMil: 0.38,
    fuelAB: 0,
    gmax: 2.8,
    gmin: 0.5,
    vne: 170,
    length: 16.65,
    gearH: 1.42,
    mainX: -0.55,
    noseX: 2.6,
    tailAngle: 0.22,
    hookX: 0,
    propR: 6.9,
    pitchK: 7.5,
    sens: 0.95,
    vs: 12,
    vApproach: 22,
    vRotate: 12,
    vCruise: 78,
    catSpeed: 0,
    launchPitch: 0,
    maxSink: 4.5,
    stats: { speed: 0.42, climb: 0.68, agility: 0.88, range: 0.72 },
    sprite: {
      src: 'images/aw139.png',
      // 1261 px = 16.65 m, origin near main rotor mast; measurements from magenta-keyed artwork
      xmin: -9.55,
      xmax: 7.10,
      ymin: -1.22,
      ymax: 4.08,
      nose: { x: 2.6, pivotY: -0.38, legLen: 0.82, wheelR: 0.22 },
      main: { x: -0.55, pivotY: -0.34, legLen: 0.86, wheelR: 0.22 },
      engines: [{ x: -0.1, y: 1.2, r: 0.45 }],
      lights: {
        nav: { x: 1.2, y: 0.6 },
        tail: { x: -8.6, y: 2.2 },
        beacon: { x: -0.2, y: 2.35 },
        rwy: { x: 6.4, y: -0.7 },
      },
    },
  },
];

export const getAircraft = (id: AircraftId): AircraftSpec => AIRCRAFT.find((a) => a.id === id) ?? AIRCRAFT[0];
