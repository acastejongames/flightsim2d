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

const NAMES = [
  'Port Haven',
  'Eagle Ridge',
  'Cape Marlow',
  'Silver Lake',
  'Falcon Bay',
  'North Harbor',
  'Granite Peak',
  'Sunset Valley',
  'Redstone',
  'Blue Cove',
  'Iron Mesa',
  'Windmere',
  'Kingsport',
  'Alder Creek',
  'Stormhaven',
  'Crescent Isle',
  'Highfield',
  'Marlin Point',
];

function natural(x: number): number {
  const n0 = fbm(x / 7000, 11, 4);
  const n = 0.5 + (n0 - 0.5) * 2.3;
  const m = fbm(x / 900, 23, 4);
  let h = (n - 0.5) * 2600;
  const inland = smoothstep(0.52, 0.8, n);
  const r = 1 - Math.abs(2 * fbm(x / 2300, 37, 4) - 1);
  h += inland * (r * r * 2300 + (m - 0.5) * 380);
  h += (m - 0.5) * 50;
  return h;
}

const apCache = new Map<number, Airport>();

export function getAirport(k: number): Airport {
  const hit = apCache.get(k);
  if (hit) return hit;
  let ap: Airport;
  if (k === 0) {
    ap = { id: 0, name: 'Home Field', x: 0, elev: 28, len: 2400 };
  } else {
    let best = k * CELL;
    let bestScore = 1e9;
    for (let j = 0; j < 8; j++) {
      const cx = k * CELL + (hash(k * 7.1 + j * 3.3) - 0.5) * 5000;
      const nat = natural(cx);
      const sc = Math.abs(nat - 90);
      if (sc < bestScore) {
        bestScore = sc;
        best = cx;
      }
    }
    ap = {
      id: k,
      name: NAMES[Math.floor(hash(k * 13.7) * NAMES.length) % NAMES.length],
      x: Math.round(best),
      elev: 12 + hash(k * 3.3) * 170,
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
