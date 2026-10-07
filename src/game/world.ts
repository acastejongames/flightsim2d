import { clamp, fbm, hash, lerp, smoothstep } from './noise';

export type WorldMode = 'open' | 'carrier';
export type TimeOfDay = 'dawn' | 'day' | 'dusk' | 'night';

export const CELL = 16000;

export interface Airport {
  id: number;
  name: string;
  x: number;
  elev: number;
  len: number;
}

export interface Carrier {
  x: number; // stern position
  vx: number;
}

export const CARRIER_LEN = 300;
export const DECK_H = 20;
export const WIRES = [58, 70, 82, 94];
export const CAT_START = 172;
export const CAT_END = 294;
export const WIRE_RUNOUT = 95;
export const OCEAN_FLOOR = -3000;

// ---------------------------------------------------------------------------
// Airport terrain safety: departures must be able to out-climb the ground.
//
// Out in the sierra the range can pile a 2000 m wall 1 km past a valley
// runway end. No transport climbs that. Two things fix it:
//
//  1. Site selection prefers airfields whose departure corridors are low
//     (see getAirport below).
//  2. A safety ceiling caps the terrain around every airport: right after
//     the runway the ground can only rise at AP_GRADE (6%), which even a
//     heavy transport beats with margin, then an ease band ramps the cap
//     back up so the wild mountains resume a few km out.
/** metres past the flattened runway core where the climbable cap applies */
const AP_PROT = 4200;
/** ease-out band where the cap rises steeply back toward the wild mountains */
const AP_EASE = 2200;
/** the cap starts at runway level: a normal climb always stays above it */
const AP_BASE = 0;
/** maximum terrain gradient near airports — every aircraft out-climbs this */
const AP_GRADE = 0.06;
/** cap gradient inside the ease band, back toward full mountains */
const AP_EASE_GRADE = 0.45;

const NAMES = [
  'Cuatro Vientos',
  'Getafe',
  'Barajas',
  'Los Llanos',
  'Alcantarilla',
  'Matacán',
  'Villanubla',
  'Talavera',
  'Morón',
  'Armilla',
  'Salamanca',
  'Zaragoza',
  'San Javier',
  'Villafría',
  'La Virgen del Camino',
  'Son Sant Joan',
  'Gando',
  'Pollensa',
];

/**
 * Meseta Central: the high plateau around Madrid/Torrejón sits near 600 m,
 * gently rolling, with broad páramo swells and the odd isolated cerro —
 * never a procedural 2000 m spike next to the runway.
 */
export const MESETA = 620;

function natural(x: number): number {
  // --- the meseta: gently rolling high plain, vegas and páramos
  let h = MESETA + (fbm(x / 5200, 11, 3) - 0.5) * 70;
  // broad alcarria swells, up to ~130 m over several km — never a wall
  h += smoothstep(0.55, 0.9, fbm(x / 14000, 23, 2)) * 130;
  // cerros testigo: sparse isolated hills, +60..200 m, ~1 km across
  const HCELL = 9000;
  const ci = Math.floor(x / HCELL);
  for (let k = ci - 1; k <= ci + 1; k++) {
    if (hash(k * 3.71 + 11.3) < 0.5) continue; // about half the cells grow a hill
    const c = (k + 0.5) * HCELL + (hash(k * 7.7 + 1.2) - 0.5) * 4200;
    const amp = 60 + hash(k * 5.3 + 4.4) * 140;
    const w = 320 + hash(k * 9.1 + 2.8) * 340;
    const d = (x - c) / w;
    if (d > 4 || d < -4) continue;
    h += amp * Math.exp(-d * d);
  }
  // small-scale roughness
  h += (fbm(x / 700, 37, 2) - 0.5) * 10;
  const meseta = h;

  // --- Sistema Central: a real mountain range far from home, with foothills
  // rising over tens of km — Guadarrama-style, peaks to ~2300 m
  const mask = smoothstep(60000, 95000, Math.abs(x));
  if (mask > 0) {
    const r = 1 - Math.abs(2 * fbm(x / 2600, 51, 4) - 1);
    const sierra = 1050 + r * r * 1150 + (fbm(x / 900, 77, 3) - 0.5) * 260;
    h = lerp(meseta, sierra, mask);
  }
  return h;
}

const apCache = new Map<number, Airport>();

export function getAirport(k: number): Airport {
  const hit = apCache.get(k);
  if (hit) return hit;
  let ap: Airport;
  if (k === 0) {
    ap = { id: 0, name: 'Torrejón', x: 0, elev: 610, len: 2400 };
  } else {
    let best = k * CELL;
    let bestScore = 1e9;
    for (let j = 0; j < 14; j++) {
      const cx = k * CELL + (hash(k * 7.1 + j * 3.3) - 0.5) * 6400;
      const nat = natural(cx);
      // departure corridors: sample the ground the pilot will climb over on
      // both runway ends and penalise high terrain, weighted toward the
      // runway — a wall 1 km out kills you, a peak 4 km out just needs a turn
      let corridor = 0;
      for (const s of [-1, 1]) {
        for (let dt = 400; dt <= 5200; dt += 600) {
          const h = natural(cx + s * dt);
          corridor += Math.max(0, h - 820) / (1 + dt / 2500);
        }
      }
      const sc = Math.abs(nat - 640) + corridor * 0.35;
      if (sc < bestScore) {
        bestScore = sc;
        best = cx;
      }
    }
    ap = {
      id: k,
      name: NAMES[Math.floor(hash(k * 13.7) * NAMES.length) % NAMES.length],
      x: Math.round(best),
      elev: 560 + hash(k * 3.3) * 220,
      len: 1700 + Math.floor(hash(k * 5.5) * 1300),
    };
  }
  apCache.set(k, ap);
  return ap;
}

export function airportsNear(x: number, range = 1): Airport[] {
  const k0 = Math.round(x / CELL);
  const out: Airport[] = [];
  for (let k = k0 - range; k <= k0 + range; k++) out.push(getAirport(k));
  return out;
}

export function airportAt(x: number, margin = 0): Airport | null {
  const k0 = Math.round(x / CELL);
  for (let k = k0 - 1; k <= k0 + 1; k++) {
    const ap = getAirport(k);
    if (Math.abs(x - ap.x) <= ap.len / 2 + margin) return ap;
  }
  return null;
}

export function terrainHeight(x: number, mode: WorldMode): number {
  if (mode === 'carrier') return OCEAN_FLOOR;
  let h = natural(x);
  const k0 = Math.round(x / CELL);
  for (let k = k0 - 1; k <= k0 + 1; k++) {
    const ap = getAirport(k);
    const half = ap.len / 2 + 250;
    const d = Math.abs(x - ap.x);
    if (d < half + 1800) {
      const t = 1 - smoothstep(half, half + 1800, d);
      h = lerp(h, ap.elev, t);
    }
    // safety ceiling: past the flattened core the ground may only rise at a
    // gradient every aircraft out-climbs, so a normal departure always has an
    // escape. Far out, an ease band ramps the cap back to the wild mountains.
    const PROT = half + AP_PROT;
    if (d > half && d < PROT + AP_EASE) {
      const dt = Math.max(0, d - ap.len / 2);
      let ceiling: number;
      let soft: number;
      if (d <= PROT) {
        ceiling = ap.elev + Math.max(2, AP_BASE + dt * AP_GRADE);
        soft = 0; // hard cap: guaranteed climbable
      } else {
        const base = ap.elev + Math.max(2, AP_BASE + (PROT - ap.len / 2) * AP_GRADE);
        ceiling = base + (d - PROT) * AP_EASE_GRADE;
        soft = 120; // rounded cap: capped peaks read as hills, not mesas
      }
      // a lumpy cap so long capped ridges read as hillsides, not concrete ramps
      ceiling += (fbm(x / 260, 77, 3) - 0.5) * 12;
      if (h > ceiling) {
        if (soft > 0) {
          const over = h - ceiling;
          h = ceiling + soft * (1 - Math.exp(-over / soft));
        } else {
          h = ceiling;
        }
      }
    }
  }
  return h;
}

export interface ToD {
  id: TimeOfDay;
  label: string;
  skyTop: number[];
  skyMid: number[];
  skyBot: number[];
  light: number[];
  sun: number[];
  sunLow: boolean;
  stars: number;
  night: boolean;
  sea: number[];
  seaDeep: number[];
}

export const TODS: Record<TimeOfDay, ToD> = {
  dawn: {
    id: 'dawn',
    label: 'Dawn',
    skyTop: [58, 88, 150],
    skyMid: [190, 150, 170],
    skyBot: [255, 190, 130],
    light: [1, 0.84, 0.74],
    sun: [255, 214, 150],
    sunLow: true,
    stars: 0.15,
    night: false,
    sea: [100, 130, 160],
    seaDeep: [24, 52, 92],
  },
  day: {
    id: 'day',
    label: 'Midday',
    skyTop: [30, 100, 205],
    skyMid: [96, 164, 232],
    skyBot: [188, 224, 252],
    light: [1, 1, 1],
    sun: [255, 248, 220],
    sunLow: false,
    stars: 0,
    night: false,
    sea: [58, 150, 196],
    seaDeep: [10, 56, 112],
  },
  dusk: {
    id: 'dusk',
    label: 'Sunset',
    skyTop: [34, 36, 96],
    skyMid: [176, 86, 110],
    skyBot: [255, 132, 66],
    light: [1, 0.66, 0.56],
    sun: [255, 170, 90],
    sunLow: true,
    stars: 0.35,
    night: false,
    sea: [140, 100, 120],
    seaDeep: [30, 30, 80],
  },
  night: {
    id: 'night',
    label: 'Night',
    skyTop: [3, 6, 20],
    skyMid: [10, 18, 46],
    skyBot: [24, 38, 80],
    light: [0.3, 0.36, 0.56],
    sun: [220, 230, 255],
    sunLow: false,
    stars: 1,
    night: true,
    sea: [30, 56, 96],
    seaDeep: [4, 14, 36],
  },
};

export const clampWorld = clamp;
