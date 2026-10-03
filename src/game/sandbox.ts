/**
 * Sandbox / free play.
 *
 * In sandbox mode every aircraft and upgrade costs nothing, the rank gates are
 * ignored and the player gets a live tuner for the whole environment: wind
 * (head/tail + cross), gusts, turbulence, clouds, precipitation, visibility,
 * icing, temperature, time of day and the weather preset itself.
 *
 * The tuner is persisted in localStorage, so the sandbox stays "open" the way
 * you left it.
 */
import type { TimeOfDay } from './world';
import { WX } from './weather';
import type { WeatherId } from './weather';

export interface SandboxTune {
  /** master switch: free hangar + tuner available in flight */
  on: boolean;
  /** indestructible: a crash is turned into a rescue instead */
  god: boolean;
  /** unlimited fuel */
  fuel: boolean;
  /** mean head(+)/tail(−) wind on the screen axis, m/s */
  wx: number;
  /** mean crosswind, m/s (pushes you off the centreline) */
  wz: number;
  /** gustiness 0..1.5 */
  gust: number;
  /** base turbulence 0..1.35 */
  turb: number;
  /** cloud cover 0..1 */
  cloud: number;
  /** precipitation rate 0..1 */
  precip: number;
  /** visibility, metres */
  vis: number;
  /** supercooled moisture available for icing 0..1 */
  ice: number;
  /** sea level temperature, °C */
  temp: number;
  /** live weather preset (drives thunder cells, rain vs snow, wetness) */
  weather: WeatherId;
  tod: TimeOfDay;
  /**
   * Turn modifier: multiplies every airframe's control sensitivity. Below 1 is
   * stately and airliner-like, above 1 is fighter-sharp. Applies to fighters
   * and ordinary aircraft alike.
   */
  turn: number;
}

export const SANDBOX_DEFAULT: SandboxTune = {
  on: true,
  god: true,
  fuel: true,
  wx: 3,
  wz: 0,
  gust: 0.3,
  turb: 0.25,
  cloud: 0.3,
  precip: 0,
  vis: 22000,
  ice: 0.1,
  temp: 18,
  weather: 'clear',
  tod: 'day',
  turn: 1,
};

const KEY = 'skybound.sandbox.v1';

export function clampTune(t: SandboxTune): SandboxTune {
  const num = (v: unknown, d: number, lo: number, hi: number) => {
    const n = typeof v === 'number' && Number.isFinite(v) ? v : d;
    return Math.min(hi, Math.max(lo, n));
  };
  const ids: WeatherId[] = ['clear', 'breezy', 'crosswind', 'overcast', 'rain', 'storm', 'fog', 'snow', 'dynamic'];
  const tods: TimeOfDay[] = ['dawn', 'day', 'dusk', 'night'];
  return {
    on: t.on !== false,
    god: t.god !== false,
    fuel: t.fuel !== false,
    wx: num(t.wx, SANDBOX_DEFAULT.wx, -18, 18),
    wz: num(t.wz, SANDBOX_DEFAULT.wz, -22, 22),
    gust: num(t.gust, SANDBOX_DEFAULT.gust, 0, 1.5),
    turb: num(t.turb, SANDBOX_DEFAULT.turb, 0, 1.35),
    cloud: num(t.cloud, SANDBOX_DEFAULT.cloud, 0, 1),
    precip: num(t.precip, SANDBOX_DEFAULT.precip, 0, 1),
    vis: num(t.vis, SANDBOX_DEFAULT.vis, 200, 40000),
    ice: num(t.ice, SANDBOX_DEFAULT.ice, 0, 1),
    temp: num(t.temp, SANDBOX_DEFAULT.temp, -30, 45),
    weather: ids.includes(t.weather) ? t.weather : 'clear',
    tod: tods.includes(t.tod) ? t.tod : 'day',
    turn: num(t.turn, SANDBOX_DEFAULT.turn, 0.4, 3),
  };
}

export function loadSandbox(): SandboxTune {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
    if (!raw) return { ...SANDBOX_DEFAULT };
    return clampTune({ ...SANDBOX_DEFAULT, ...(JSON.parse(raw) as Partial<SandboxTune>) });
  } catch {
    return { ...SANDBOX_DEFAULT };
  }
}

export function saveSandbox(t: SandboxTune): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(clampTune(t)));
  } catch {
    /* ignore */
  }
}

/** Move the whole tuner onto a weather preset (used by the preset buttons). */
export function tuneFromPreset(t: SandboxTune, id: WeatherId): SandboxTune {
  const w = WX[id] ?? WX.clear;
  return clampTune({
    ...t,
    weather: id,
    wx: w.wx,
    wz: w.wz,
    gust: w.gust,
    turb: w.turb,
    cloud: w.cover,
    precip: w.precipRate,
    vis: w.vis,
    ice: w.icing,
    temp: w.temp,
  });
}

/** Slider helpers: visibility feels better on a log scale. */
export const visToSlider = (m: number): number => Math.round((Math.log(Math.max(200, m) / 200) / Math.log(40000 / 200)) * 100);
export const sliderToVis = (v: number): number => Math.round(200 * Math.pow(40000 / 200, Math.min(100, Math.max(0, v)) / 100));

export const SANDBOX_LIMITS = {
  turn: { min: 0.4, max: 3, step: 0.05 },
  wx: { min: -18, max: 18, step: 0.5 },
  wz: { min: -22, max: 22, step: 0.5 },
  gust: { min: 0, max: 1.5, step: 0.05 },
  turb: { min: 0, max: 1.35, step: 0.05 },
  cloud: { min: 0, max: 1, step: 0.05 },
  precip: { min: 0, max: 1, step: 0.05 },
  ice: { min: 0, max: 1, step: 0.05 },
  temp: { min: -30, max: 45, step: 1 },
};
