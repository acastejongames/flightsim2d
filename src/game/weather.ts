import { clamp, fbm2, hash, noise1, smoothstep } from './noise';
import type { SandboxTune } from './sandbox';
import { terrainHeight } from './world';
import type { WorldMode } from './world';
import type { IconName } from '../components/Ico';

export type WeatherId = 'clear' | 'breezy' | 'crosswind' | 'overcast' | 'rain' | 'storm' | 'fog' | 'snow' | 'dynamic';

export interface WeatherPreset {
  id: WeatherId;
  icon: IconName;
  en: string;
  es: string;
  descEn: string;
  descEs: string;
  wx: number; // mean wind along the screen axis (m/s, positive = toward +X)
  wz: number; // mean crosswind component (m/s)
  gust: number; // 0..1 gustiness
  turb: number; // 0..1 base turbulence
  shear: number; // vertical wind shear (0..1)
  cover: number; // 0..1 cloud coverage
  ceiling: number; // cloud base (m)
  precip: 'none' | 'rain' | 'snow';
  precipRate: number; // 0..1
  vis: number; // visibility (m)
  temp: number; // sea level OAT (°C)
  storm: boolean; // thunder cells, microbursts, lightning
  icing: number; // 0..1 supercooled moisture available
  seaState: number; // 0..1 wave amplitude multiplier
}

export const WEATHERS: WeatherPreset[] = [
  {
    id: 'clear', icon: 'sun', en: 'Clear', es: 'Despejado',
    descEn: 'Calm air, unlimited visibility. Ideal to learn.', descEs: 'Aire en calma y visibilidad ilimitada. Ideal para aprender.',
    wx: 2.2, wz: 0.8, gust: 0.12, turb: 0.1, shear: 0.08, cover: 0.15, ceiling: 900,
    precip: 'none', precipRate: 0, vis: 26000, temp: 21, storm: false, icing: 0, seaState: 0.5,
  },
  {
    id: 'breezy', icon: 'wind', en: 'Breezy', es: 'Brisa',
    descEn: 'Noticeable wind, light chop and a few cumulus.', descEs: 'Viento notable, turbulencia ligera y algunos cúmulos.',
    wx: 6.5, wz: 3, gust: 0.32, turb: 0.28, shear: 0.16, cover: 0.35, ceiling: 1100,
    precip: 'none', precipRate: 0, vis: 21000, temp: 18, storm: false, icing: 0, seaState: 0.9,
  },
  {
    id: 'crosswind', icon: 'crosswind', en: 'Crosswind', es: 'Viento cruzado',
    descEn: 'Strong crosswind — keep it on the centreline with rudder (J/L).', descEs: 'Viento cruzado fuerte: mantén el eje con el timón (J/L).',
    wx: 2.5, wz: 11, gust: 0.45, turb: 0.4, shear: 0.22, cover: 0.35, ceiling: 1200,
    precip: 'none', precipRate: 0, vis: 20000, temp: 15, storm: false, icing: 0, seaState: 1.1,
  },
  {
    id: 'overcast', icon: 'overcast', en: 'Overcast', es: 'Cubierto',
    descEn: 'Solid deck, low ceiling, smooth but blind near the cloud base.', descEs: 'Techo sólido y bajo; suave, pero ciego cerca de la base.',
    wx: 8, wz: 4.5, gust: 0.38, turb: 0.34, shear: 0.3, cover: 0.88, ceiling: 620,
    precip: 'none', precipRate: 0, vis: 12000, temp: 12, storm: false, icing: 0.25, seaState: 1.2,
  },
  {
    id: 'rain', icon: 'rain', en: 'Rain', es: 'Lluvia',
    descEn: 'Steady rain, wet runway, reduced braking action.', descEs: 'Lluvia constante, pista mojada y frenado reducido.',
    wx: 10, wz: 5, gust: 0.55, turb: 0.5, shear: 0.42, cover: 0.95, ceiling: 480,
    precip: 'rain', precipRate: 0.55, vis: 5200, temp: 10, storm: false, icing: 0.6, seaState: 1.6,
  },
  {
    id: 'storm', icon: 'storm', en: 'Thunderstorm', es: 'Tormenta',
    descEn: 'Cumulonimbus, severe turbulence, microbursts, lightning. Dangerous.', descEs: 'Cumulonimbos, turbulencia severa, micro-ráfagas y rayos. Peligroso.',
    wx: 16, wz: 9, gust: 1, turb: 0.92, shear: 0.75, cover: 1, ceiling: 320,
    precip: 'rain', precipRate: 0.95, vis: 2200, temp: 15, storm: true, icing: 0.85, seaState: 2.4,
  },
  {
    id: 'fog', icon: 'fog', en: 'Fog', es: 'Niebla',
    descEn: 'Thick fog: you will need instruments and a gentle approach.', descEs: 'Niebla densa: necesitarás instrumentos y una aproximación suave.',
    wx: 2, wz: 1, gust: 0.1, turb: 0.14, shear: 0.06, cover: 0.55, ceiling: 90,
    precip: 'none', precipRate: 0, vis: 550, temp: 6, storm: false, icing: 0.2, seaState: 0.4,
  },
  {
    id: 'snow', icon: 'snow', en: 'Snow', es: 'Nieve',
    descEn: 'Sub-zero airframe icing, snow showers and poor visibility.', descEs: 'Engelamiento bajo cero, chubascos de nieve y mala visibilidad.',
    wx: 7.5, wz: 4, gust: 0.5, turb: 0.44, shear: 0.4, cover: 0.96, ceiling: 380,
    precip: 'snow', precipRate: 0.75, vis: 2400, temp: -6, storm: false, icing: 1, seaState: 1.4,
  },
  {
    id: 'dynamic', icon: 'front', en: 'Dynamic front', es: 'Frente dinámico',
    descEn: 'It starts calm — and then the weather comes for you.', descEs: 'Empieza en calma… y luego el tiempo viene a por ti.',
    wx: 3, wz: 1.5, gust: 0.2, turb: 0.16, shear: 0.12, cover: 0.25, ceiling: 1000,
    precip: 'none', precipRate: 0, vis: 22000, temp: 17, storm: false, icing: 0.1, seaState: 0.6,
  },
];

export const WX: Record<WeatherId, WeatherPreset> = WEATHERS.reduce(
  (acc, w) => {
    acc[w.id] = w;
    return acc;
  },
  {} as Record<WeatherId, WeatherPreset>,
);

export interface AirState {
  wx: number;
  wz: number;
  wy: number;
  gust: number;
  turb: number;
  cloud: number;
  precip: number;
  temp: number;
  vis: number;
  micro: number;
}

const NUM_KEYS = ['wx', 'wz', 'gust', 'turb', 'shear', 'cover', 'ceiling', 'precipRate', 'vis', 'temp', 'icing', 'seaState'] as const;

export class Weather {
  id: WeatherId;
  preset: WeatherPreset;
  private blended: number[]; // numeric fields currently in force (for smooth front transitions)
  private target: WeatherPreset | null = null;
  private blendT = 0;
  private shiftIn = 120;
  private seed = Math.random() * 100;

  /** screen flash 0..1 from a recent strike */
  flash = 0;
  /** pending thunder for the audio engine: 0..1 */
  thunder = 0;
  strike: { x: number; y: number; t: number } | null = null;
  private strikeCool = 3;

  /** runway / ground wetness 0..1 */
  wetness = 0;
  private wetTarget = 0;

  /** sandbox tuner: when `tune.on` these values override the preset's numbers */
  tune: SandboxTune | null = null;

  private get tuned(): SandboxTune | null {
    return this.tune && this.tune.on ? this.tune : null;
  }

  /** cloud cover in force (tuner or preset) */
  get coverNow(): number {
    return this.tuned ? this.tuned.cloud : this.v('cover');
  }

  /** precipitation rate in force */
  get precipNow(): number {
    return this.tuned ? this.tuned.precip : this.v('precipRate');
  }

  /** visibility in force, metres */
  get visNow(): number {
    return this.tuned ? this.tuned.vis : this.v('vis');
  }

  /** supercooled moisture in force */
  get iceNow(): number {
    return this.tuned ? this.tuned.ice : this.v('icing');
  }

  /** sea level temperature in force */
  get tempNow(): number {
    return this.tuned ? this.tuned.temp : this.v('temp');
  }

  /** rain / snow in force — the tuner can add rain to any preset */
  get precipKind(): 'none' | 'rain' | 'snow' {
    const base = this.preset.precip;
    if (base !== 'none') return base;
    const T = this.tuned;
    return T && T.precip > 0.01 ? 'rain' : 'none';
  }

  /** Swap the preset in place (sandbox weather buttons). */
  setPreset(id: WeatherId): void {
    this.id = id;
    this.preset = WX[id] ?? WX.clear;
    this.blended = NUM_KEYS.map((k) => this.preset[k] as number);
    this.target = null;
    this.blendT = 0;
    this.shiftIn = this.preset.id === 'dynamic' ? 25 : 120;
  }

  constructor(id: WeatherId, _mode: WorldMode) {
    this.id = id;
    this.preset = WX[id] ?? WX.clear;
    this.blended = NUM_KEYS.map((k) => this.preset[k] as number);
    if (this.preset.id === 'dynamic') this.shiftIn = 25;
  }

  /** current numeric value of a preset field, after any front blending */
  private v(key: (typeof NUM_KEYS)[number]): number {
    return this.blended[NUM_KEYS.indexOf(key)];
  }

  get label(): string {
    return this.preset.en;
  }

  /** Precipitation of a storm cell: 0..1 */
  stormCell(x: number): number {
    if (!this.preset.storm && this.v('cover') < 0.9) return 0;
    const n = fbm2(x / 7000, 3.3 + this.seed, 12, 2);
    return clamp((n - 0.5) * 3.2, 0, 1) * (this.preset.storm ? 1 : 0.35);
  }

  /** 0..1 cloud density at a world point */
  cloudAt(x: number, y: number): number {
    const cover = this.coverNow;
    if (cover < 0.03) return 0;
    const base = this.v('ceiling');
    const storm = this.preset.storm ? 1 : 0;
    const thick = 900 + cover * 2800 + storm * 5200;
    const top = base + thick;
    const env = smoothstep(base - 260, base + 220, y) * (1 - smoothstep(top * 0.62, top, y));
    if (env <= 0.001 && y > 5000) {
      // thin cirrus veil above everything when the sky is heavily covered
      const ci = smoothstep(0.72, 1, cover) * smoothstep(5200, 6600, y) * (1 - smoothstep(9000, 11000, y));
      return clamp(ci * 0.5, 0, 1);
    }
    if (env <= 0.001) return 0;
    const field = fbm2(x / 1500 + this.seed * 0.3, y / 950, 5, 3);
    const cellF = smoothstep(0.62 - cover * 0.34, 0.92, field);
    return clamp(cellF * env * (0.45 + cover * 0.75), 0, 1);
  }

  /** 0..1 precipitation rate at a world point */
  precipAt(x: number, y: number): number {
    const rate = this.precipNow;
    if (this.precipKind === 'none' || rate <= 0.001) return 0;
    const cell = fbm2(x / 2400 + 40, 8.5, 9, 2);
    const storm = this.stormCell(x);
    const inten = clamp(rate * (0.25 + 1.15 * cell) + storm * 0.7, 0, 1);
    const top = this.v('ceiling') + 1400 + this.coverNow * 3200 + (this.preset.storm ? 6000 : 0);
    const vert = 1 - smoothstep(top - 1200, top, y);
    return clamp(inten * vert, 0, 1);
  }

  tempAt(y: number): number {
    return Math.max(-62, this.tempNow - 0.0065 * Math.max(0, y));
  }

  visibility(x: number, _y: number, cloud: number): number {
    let vis = this.visNow * (0.85 + 0.3 * noise1(x / 5200 + this.seed, 21));
    vis *= 1 - 0.86 * cloud;
    return clamp(vis, 140, 40000);
  }

  /** Dynamic front evolution */
  update(dt: number, time: number): void {
    const p = this.preset;
    this.flash = Math.max(0, this.flash - dt * 3.2);
    if (this.strike) {
      if (time - this.strike.t > 0.7) this.strike = null;
    }

    // wetness follows the precipitation we are actually flying through
    const kind = this.tuned ? this.precipKind : p.precip;
    const wetTarget = kind === 'rain' ? 1 : kind === 'snow' ? 0.55 : 0;
    this.wetTarget = wetTarget;
    const dry = 1 / 55;
    if (this.wetness < this.wetTarget) this.wetness = Math.min(this.wetTarget, this.wetness + dt * 0.018);
    else this.wetness = Math.max(this.wetTarget, this.wetness - dt * dry);

    if (p.id !== 'dynamic') return;
    this.shiftIn -= dt;
    if (!this.target && this.shiftIn <= 0) {
      const pool: WeatherId[] = ['breezy', 'overcast', 'rain', 'storm', 'crosswind', 'fog'];
      const pick = pool[Math.floor(hash(time * 0.37 + this.seed) * pool.length) % pool.length];
      this.target = WX[pick];
      this.blendT = 0;
    }
    if (this.target) {
      this.blendT = Math.min(1, this.blendT + dt / 150);
      const t = smoothstep(0, 1, this.blendT);
      const src = this.preset;
      for (let i = 0; i < NUM_KEYS.length; i++) {
        const k = NUM_KEYS[i];
        this.blended[i] = (src[k] as number) + ((this.target[k] as number) - (src[k] as number)) * t;
      }
      if (this.blendT >= 1) {
        this.preset = this.target;
        this.id = this.target.id === 'dynamic' ? 'breezy' : this.target.id;
        this.target = null;
        this.shiftIn = 120 + hash(time * 1.7) * 180;
      }
    }
  }

  /** True while a front is changing the sky (used for HUD alerts) */
  get evolving(): boolean {
    return this.target !== null;
  }

  get incoming(): WeatherPreset | null {
    return this.target;
  }

  /** Instantaneous air state: wind vector, gusts, turbulence, moisture */
  sample(opts: {
    x: number;
    y: number;
    time: number;
    isDay: boolean;
    mode: WorldMode;
    slope: number;
    /** 0..1 how "smooth" the terrain around is (1 = flat, 0 = rugged) */
    smoothness: number;
  }): AirState {
    const { x, y, time, isDay, mode, slope, smoothness } = opts;
    const p = this.preset;
    const T = this.tuned;
    const t = time + this.seed;
    const alt = Math.max(0, y);
    const ground = mode === 'carrier' ? 0 : Math.max(0, terrainHeight(x, mode));
    const agl = Math.max(0, y - ground);

    // --- mean wind: boundary layer profile + shear aloft
    const hf = 1 - Math.exp(-alt / 950);
    const shear = this.v('shear');
    const aloft = 1 + shear * 0.95 * hf + (p.storm ? 0.3 * hf : 0);
    const meanWx = T ? T.wx : this.v('wx');
    const meanWz = T ? T.wz : this.v('wz');
    const gAmp = T ? T.gust : this.v('gust');
    const wxBase = meanWx * (1 + gAmp * 0.25);
    const wzBase = meanWz * (1 + gAmp * 0.2);

    // --- gusts
    const g1 = (noise1(t * 0.42, 31) - 0.5) * 2;
    const g2 = (noise1(t * 1.85, 47) - 0.5) * 2;
    const gust = gAmp * (g1 * 0.75 + g2 * 0.45);
    const speed = Math.hypot(meanWx, meanWz) * aloft;
    const gustAbs = gust * (2.5 + speed * 0.55);

    // --- low level mechanical turbulence: terrain roughness + wind
    const mech = clamp((1 - smoothness) * clamp(speed / 9, 0, 1.4), 0, 1) * (1 - smoothstep(80, 1400, agl));
    const turbBase = T ? T.turb : this.v('turb');
    const thermScale = T ? T.turb : 1;

    // --- convective thermals over land by day
    let wy = 0;
    let thermo = 0;
    if (mode === 'open' && ground > 4 && isDay) {
      const cell = fbm2(x / 1500, 77.7, 3, 2);
      // thermals live low but should not fight you in the last few hundred metres
      const strength = smoothstep(0.56, 0.86, cell) * smoothstep(60, 260, agl) * (1 - smoothstep(900, 2100, agl));
      thermo = strength * 0.8 * thermScale;
      wy += strength * 3.6 * thermScale;
    }
    // --- ridge lift: wind blowing up a slope
    if (mode === 'open' && agl < 900) {
      const ridge = clamp(wxBase * aloft * slope * 0.9, -9, 9) * thermScale;
      wy += ridge * (1 - smoothstep(250, 900, agl));
    }

    // --- storm cell: downdraft + low level outflow (microburst)
    let micro = 0;
    if (p.storm) {
      const cell = this.stormCell(x);
      if (cell > 0.05) {
        const lowAlt = 1 - smoothstep(400, 1600, agl);
        micro = cell * lowAlt;
        const core = 1 - smoothstep(600, 2200, Math.abs(((x % 9000) + 9000) % 9000 - 4500));
        wy -= micro * (12 * core + 4);
      }
    }

    // --- turbulence intensity the airframe will feel
    const turb = clamp(turbBase + gAmp * Math.abs(g2) * 0.35 + mech * 0.55 * thermScale + thermo * 0.35 + micro * 0.8 * thermScale, 0, 1.35);

    // --- vertical gust velocity (the air cannot move vertically at the surface,
    // so the lift/sink fades out in the last few dozen metres — landings stay predictable)
    const groundFade = 0.15 + 0.85 * smoothstep(0, 70, agl);
    const vy = (wy + turb * (noise1(t * 2.6, 61) - 0.5) * (p.storm ? 16 : 9) + gustAbs * 0.5) * groundFade;

    // --- horizontal wind including outflow at the bottom of a cell
    let wx = wxBase * aloft + gustAbs;
    let wz = wzBase * aloft + gustAbs * 0.55;
    if (micro > 0) {
      const d = ((x % 9000) + 9000) % 9000 - 4500; // distance from the cell axis
      wx += micro * 9 * Math.sign(d || 1);
    }
    // sea breeze / valley channeling: gentle horizontal speed variation
    wx *= 0.9 + 0.2 * noise1(x / 3300, 83);
    wz *= 0.9 + 0.2 * noise1(x / 4100, 97);

    const cloud = this.cloudAt(x, y);
    const precip = this.precipAt(x, y);
    const vis = this.visibility(x, y, cloud);

    return { wx, wz, wy: vy, gust: gustAbs, turb, cloud, precip, temp: this.tempAt(y), vis, micro };
  }

  /** Lightning scheduling. Returns strike intensity 0..1 when a bolt fires. */
  maybeStrike(dt: number, x: number, y: number, time: number): number {
    this.strikeCool -= dt;
    if (!this.preset.storm || this.strikeCool > 0) return 0;
    const cell = this.stormCell(x);
    if (cell < 0.35) {
      this.strikeCool = 1.5;
      return 0;
    }
    const p = clamp(cell * (0.05 + 0.2 * Math.random()), 0.01, 0.5) * dt;
    if (Math.random() > p) return 0;
    this.strikeCool = 4 + Math.random() * 22;
    const sx = x + (Math.random() - 0.5) * 5200;
    this.strike = { x: sx, y: 420 + Math.random() * 2600, t: time };
    const d = Math.abs(sx - x);
    this.flash = clamp(1 - d / 7000, 0.1, 1);
    this.thunder = 0.4 + this.flash * 0.6;
    void y;
    return this.flash;
  }

  /** vertical precipitation profile ahead of (and around) the aircraft, for the weather radar */
  radar(x0: number, y0: number, rangeX: number, rangeY: number, cols: number, rows: number): number[][] {
    const out: number[][] = [];
    for (let r = 0; r < rows; r++) {
      const row: number[] = [];
      const y = y0 + (1 - (2 * r) / (rows - 1)) * rangeY;
      for (let c = 0; c < cols; c++) {
        const x = x0 + (-0.35 + (1.35 * c) / (cols - 1)) * rangeX;
        const p = this.precipAt(x, y);
        const cloud = this.cloudAt(x, y) * 0.55;
        row.push(clamp(p + cloud * 0.8, 0, 1));
      }
      out.push(row);
    }
    return out;
  }
}
