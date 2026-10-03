export type AircraftId = 'sparrow' | 'corsair' | 'hornet';

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
  // menu stats 0..1
  stats: { speed: number; climb: number; agility: number; range: number };
}

export const AIRCRAFT: AircraftSpec[] = [
  {
    id: 'sparrow',
    name: 'Sparrow 172',
    role: 'Light trainer',
    desc: 'Forgiving high-wing piston single. Short field, gentle stall, lovely for open-world sightseeing.',
    kind: 'prop',
    carrier: false,
    fixedGear: true,
    emptyMass: 800,
    fuelMax: 140,
    S: 16.2,
    CLa: 4.6,
    alpha0: -0.035,
    alphaStall: 0.27,
    Cd0: 0.031,
    k: 0.057,
    flapCd: 0.018,
    gearCd: 0,
    power: 135000,
    propEff: 0.8,
    thrustStatic: 3100,
    thrustMil: 0,
    thrustAB: 0,
    spool: 0.35,
    fuelIdle: 0.012,
    fuelMil: 0.045,
    fuelAB: 0,
    gmax: 4.4,
    gmin: 1.8,
    vne: 85,
    length: 8.3,
    gearH: 1.25,
    mainX: -0.2,
    noseX: 1.9,
    tailAngle: 0.22,
    hookX: 0,
    propR: 0.95,
    pitchK: 5,
    vs: 28,
    vApproach: 38,
    vRotate: 31,
    vCruise: 58,
    catSpeed: 0,
    launchPitch: 0,
    maxSink: 3.6,
    stats: { speed: 0.2, climb: 0.35, agility: 0.55, range: 0.9 },
  },
  {
    id: 'corsair',
    name: 'F4U Corsair',
    role: 'Carrier warbird',
    desc: 'Gull-winged 2,000 hp fighter. Torquey, heavy, great carrier trainer with a tailhook and catapult gear.',
    kind: 'prop',
    carrier: true,
    fixedGear: false,
    emptyMass: 4200,
    fuelMax: 700,
    S: 29,
    CLa: 4.7,
    alpha0: -0.035,
    alphaStall: 0.25,
    Cd0: 0.023,
    k: 0.07,
    flapCd: 0.018,
    gearCd: 0.014,
    power: 1700000,
    propEff: 0.82,
    thrustStatic: 27000,
    thrustMil: 0,
    thrustAB: 0,
    spool: 0.5,
    fuelIdle: 0.06,
    fuelMil: 0.5,
    fuelAB: 0,
    gmax: 7,
    gmin: 3,
    vne: 230,
    length: 10.2,
    gearH: 1.9,
    mainX: -0.3,
    noseX: 2.6,
    tailAngle: 0.2,
    hookX: 4.3,
    propR: 2.0,
    pitchK: 5.5,
    vs: 45,
    vApproach: 52,
    vRotate: 52,
    vCruise: 120,
    catSpeed: 50,
    launchPitch: 0.12,
    maxSink: 6.5,
    stats: { speed: 0.5, climb: 0.55, agility: 0.7, range: 0.6 },
  },
  {
    id: 'hornet',
    name: 'F/A-18 Hornet',
    role: 'Supersonic strike fighter',
    desc: 'Twin-engine jet with afterburners, 8+ g and Mach 1.4+. Fast, unforgiving, and magnificent on the cat.',
    kind: 'jet',
    carrier: true,
    fixedGear: false,
    emptyMass: 11200,
    fuelMax: 4200,
    S: 38,
    CLa: 3.9,
    alpha0: -0.02,
    alphaStall: 0.43,
    Cd0: 0.019,
    k: 0.115,
    flapCd: 0.016,
    gearCd: 0.018,
    power: 0,
    propEff: 0,
    thrustStatic: 0,
    thrustMil: 105000,
    thrustAB: 160000,
    spool: 1.0,
    fuelIdle: 0.3,
    fuelMil: 2.4,
    fuelAB: 8,
    gmax: 8.5,
    gmin: 3.5,
    vne: 520,
    length: 17.1,
    gearH: 2.1,
    mainX: -0.4,
    noseX: 5.5,
    tailAngle: 0.25,
    hookX: 7.4,
    propR: 0,
    pitchK: 9,
    vs: 60,
    vApproach: 70,
    vRotate: 75,
    vCruise: 230,
    catSpeed: 72,
    launchPitch: 0.14,
    maxSink: 7.2,
    stats: { speed: 1, climb: 0.95, agility: 0.85, range: 0.5 },
  },
];

export const getAircraft = (id: AircraftId): AircraftSpec => AIRCRAFT.find((a) => a.id === id) ?? AIRCRAFT[0];
