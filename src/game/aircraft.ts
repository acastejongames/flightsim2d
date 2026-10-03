export type AircraftId = 'pc21' | 'cn235' | 'ef18' | 'typhoon';

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
}

export interface AircraftSpec {
  id: AircraftId;
  name: string;
  role: string;
  desc: string;
  kind: 'prop' | 'jet';
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
    emptyMass: 11500,
    fuelMax: 4900,
    S: 38,
    CLa: 4.1,
    alpha0: -0.018,
    alphaStall: 0.46,
    Cd0: 0.019,
    k: 0.11,
    flapCd: 0.017,
    gearCd: 0.017,
    power: 0,
    propEff: 0,
    thrustStatic: 0,
    thrustMil: 108000,
    thrustAB: 165000,
    spool: 1.0,
    fuelIdle: 0.32,
    fuelMil: 2.5,
    fuelAB: 8.2,
    gmax: 8.5,
    gmin: 3.5,
    vne: 560,
    length: 17.07,
    gearH: 2.2,
    mainX: 0.5,
    noseX: 6.3,
    tailAngle: 0.24,
    hookX: 6.6,
    propR: 0,
    pitchK: 9.4,
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
      nose: { x: 6.3, pivotY: -0.72, legLen: 1.16, wheelR: 0.32 },
      main: { x: -0.5, pivotY: -0.78, legLen: 1.1, wheelR: 0.32 },
      engines: [
        { x: -6.45, y: 0.16, r: 0.42 },
        { x: -6.35, y: -0.12, r: 0.42 },
      ],
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
    power: 1200000,
    propEff: 0.85,
    thrustStatic: 16000,
    thrustMil: 0,
    thrustAB: 0,
    spool: 0.45,
    fuelIdle: 0.03,
    fuelMil: 0.16,
    fuelAB: 0,
    gmax: 8,
    gmin: 3,
    vne: 190,
    length: 11.23,
    gearH: 1.5,
    mainX: 0.2,
    noseX: 4.7,
    tailAngle: 0.2,
    hookX: 0,
    propR: 1.2,
    pitchK: 7,
    sens: 1.15,
    vs: 32,
    vApproach: 36,
    vRotate: 36,
    vCruise: 105,
    catSpeed: 0,
    launchPitch: 0,
    maxSink: 3.8,
    stats: { speed: 0.55, climb: 0.6, agility: 0.75, range: 0.7 },
    sprite: {
      src: 'images/pc21.png',
      xmin: -5.05,
      xmax: 6.18,
      ymin: -0.84,
      ymax: 2.62,
      nose: { x: 4.5, pivotY: -0.44, legLen: 0.84, wheelR: 0.22 },
      main: { x: -0.1, pivotY: -0.46, legLen: 0.82, wheelR: 0.22 },
      engines: [{ x: 5.35, y: 0.28, r: 1.3 }],
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
    power: 2600000,
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
    gearH: 2.6,
    mainX: -1.4,
    noseX: 5.8,
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
      nose: { x: 5.1, pivotY: -0.82, legLen: 1.48, wheelR: 0.3 },
      main: { x: -0.3, pivotY: -0.86, legLen: 1.44, wheelR: 0.3 },
      engines: [{ x: 4.72, y: 1.6, r: 1.85 }],
    },
  },
  {
    id: 'typhoon',
    name: 'Typhoon C.16',
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
    k: 0.1,
    flapCd: 0.018,
    gearCd: 0.016,
    power: 0,
    propEff: 0,
    thrustStatic: 0,
    thrustMil: 96000,
    thrustAB: 180000,
    spool: 1.1,
    fuelIdle: 0.28,
    fuelMil: 2.3,
    fuelAB: 8.4,
    gmax: 9,
    gmin: 3.5,
    vne: 600,
    length: 15.96,
    gearH: 2.35,
    mainX: -0.5,
    noseX: 4.6,
    tailAngle: 0.28,
    hookX: 0,
    propR: 0,
    pitchK: 9.8,
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
      nose: { x: 4.6, pivotY: -0.8, legLen: 1.25, wheelR: 0.3 },
      main: { x: -0.5, pivotY: -0.9, legLen: 1.1, wheelR: 0.35 },
      engines: [{ x: -7.0, y: 0.12, r: 0.6 }],
    },
  },
];

export const getAircraft = (id: AircraftId): AircraftSpec => AIRCRAFT.find((a) => a.id === id) ?? AIRCRAFT[0];
