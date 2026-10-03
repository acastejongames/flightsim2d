import { clamp, fbm, hash, mixRGB, smoothstep } from './noise';
import type { Sim, Particle } from './sim';
import { CARRIER_LEN, CAT_END, CAT_START, DECK_H, TODS, WIRES, airportAt, airportsNear, terrainHeight } from './world';
import type { DecorKey } from './decor';
import { DECOR, decorSprite, drawDecorSprite, preloadDecor } from './decor';
import type { Airport, TimeOfDay, ToD, WorldMode } from './world';
import { drawAircraft } from './sprites';
import { drawHUD } from './hud';
import type { HudExtra } from './hud';

interface Star {
  x: number;
  y: number;
  r: number;
  t: number;
}

const TERRAIN_STOPS: [number, number[]][] = [
  [3000, [246, 248, 252]],
  [1900, [232, 236, 244]],
  [1500, [172, 172, 178]],
  [1000, [124, 116, 106]],
  [600, [88, 102, 72]],
  [250, [62, 100, 52]],
  [60, [88, 130, 62]],
  [4, [142, 158, 90]],
  [0, [208, 192, 144]],
  [-40, [150, 136, 100]],
  [-300, [60, 56, 52]],
];

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  W = 0;
  H = 0;
  dpr = 1;
  cam = { x: 0, y: 0, zoom: 3.5, leadX: 0, leadY: 0 };
  userZoom = 1;
  private tod: ToD;

  /** Change the time of day mid-flight (sandbox tuner). */
  setTod(id: TimeOfDay): void {
    this.tod = TODS[id];
    this.light = this.tod.light;
  }
  private light: number[];
  private clouds: HTMLCanvasElement[] = [];
  private cloudsDark: HTMLCanvasElement[] = [];
  private cloudsFromSprite = false;
  private stars: Star[] = [];
  private hbuf = new Float32Array(1024);
  private initCam = false;
  private fps = 60;
  /** weather mood for this frame */
  private mood = { cover: 0.2, precip: 0, storm: false, rain: 0, snow: 0, vis: 26000, wet: 0, sea: 1, cloud: 0, flash: 0 };
  private wxLight = 1;
  private rainDrops: { x: number; y: number; l: number; s: number }[] = [];
  private flakes: { x: number; y: number; r: number; s: number; p: number }[] = [];

  constructor(private canvas: HTMLCanvasElement, todId: TimeOfDay) {
    this.ctx = canvas.getContext('2d')!;
    this.tod = TODS[todId];
    this.light = this.tod.light;
    preloadDecor(); // warm the scenery sprite cache so nothing pops in later
    for (let i = 0; i < 220; i++) {
      this.stars.push({ x: hash(i * 1.3), y: hash(i * 2.9 + 4), r: 0.5 + hash(i * 5.1) * 1.4, t: hash(i * 7.7) * 6 });
    }
    this.buildClouds();
  }

  resize(w: number, h: number, dpr: number): void {
    this.W = w;
    this.H = h;
    this.dpr = dpr;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
  }

  // ---------------------------------------------------------------- color helpers
  private lit(c: number[], a = 1): string {
    const L = this.light;
    const k = this.wxLight + this.mood.flash * 1.1;
    return `rgba(${Math.min(255, c[0] * L[0] * k) | 0},${Math.min(255, c[1] * L[1] * k) | 0},${Math.min(255, c[2] * L[2] * k) | 0},${a})`;
  }

  /** Grey/dark tint the weather puts on the whole scene. */
  private wxTint(c: number[], amount: number, dark: boolean): number[] {
    const target = dark ? [26, 28, 36] : [128, 134, 146];
    return mixRGB(c, target, amount);
  }

  private updateMood(sim: Sim): void {
    const wx = sim.weather;
    const p = wx.preset;
    const cover = wx.cloudAt(sim.x, sim.y);
    const precip = wx.precipAt(sim.x, sim.y);
    const kind = wx.precipKind;
    this.mood = {
      cover: p.cover,
      precip,
      storm: p.storm,
      rain: kind === 'rain' ? precip : 0,
      snow: kind === 'snow' ? precip : 0,
      vis: wx.visibility(sim.x, sim.y, cover),
      wet: wx.wetness,
      sea: p.seaState,
      cloud: cover,
      flash: wx.flash,
    };
    const gloom = clamp(wx.coverNow * 0.55 + (p.storm ? 0.3 : 0) + precip * 0.2, 0, 1);
    this.wxLight = 1 - gloom * (this.tod.night ? 0.25 : 0.42);
    if (this.rainDrops.length === 0) {
      for (let i = 0; i < 320; i++) this.rainDrops.push({ x: hash(i * 1.7), y: hash(i * 3.1 + 2), l: 0.5 + hash(i * 5.3) * 1.5, s: 0.6 + hash(i * 7.9) * 0.9 });
      for (let i = 0; i < 220; i++) this.flakes.push({ x: hash(i * 2.3 + 11), y: hash(i * 4.7 + 5), r: 0.6 + hash(i * 6.1) * 1.6, s: 0.3 + hash(i * 8.3), p: hash(i * 9.7) * 6 });
    }
  }
  private raw(c: number[], a = 1): string {
    return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  }

  private sx(wx: number): number {
    return (wx - this.cam.x) * this.cam.zoom + this.W / 2;
  }
  private sy(wy: number): number {
    return this.H / 2 - (wy - this.cam.y) * this.cam.zoom;
  }

  // ---------------------------------------------------------------- cloud sprites
  private buildClouds(): void {
    this.clouds = this.makeCloudSet(false);
    this.cloudsDark = this.makeCloudSet(true);
  }

  private makeCloudSet(dark: boolean): HTMLCanvasElement[] {
    const out: HTMLCanvasElement[] = [];
    const spr = decorSprite(DECOR.cloud);
    const t = this.tod;
    let top = t.id === 'dusk' ? [255, 200, 170] : t.id === 'dawn' ? [255, 226, 205] : [255, 255, 255];
    let shade = t.id === 'dusk' ? [170, 110, 140] : [150, 166, 196];
    if (dark) {
      top = [104, 108, 120];
      shade = [42, 45, 56];
    }
    const L = t.light;
    const c = (v: number[], a: number) =>
      `rgba(${Math.min(255, v[0] * (0.4 + L[0] * 0.6)) | 0},${Math.min(255, v[1] * (0.4 + L[1] * 0.6)) | 0},${Math.min(255, v[2] * (0.4 + L[2] * 0.6)) | 0},${a})`;
    for (let v = 0; v < 3; v++) {
      const cv = document.createElement('canvas');
      cv.width = 420;
      cv.height = 180;
      const g = cv.getContext('2d')!;
      if (spr) {
        // hand-drawn cumulus, squashed and tinted for each cloud variant and
        // every time of day
        const scaleW = 420 * (0.86 + v * 0.09);
        const scaleH = 180 * (0.9 + v * 0.06);
        const dx = (420 - scaleW) / 2 + (v - 1) * 6;
        const dy = 180 - scaleH;
        g.drawImage(spr.img, dx, dy, scaleW, scaleH);
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = c(dark ? [70, 74, 88] : top, dark ? 0.62 : 0.28);
        g.fillRect(0, 0, 420, 180);
        g.globalCompositeOperation = 'source-over';
        out.push(cv);
        continue;
      }
      const puffs: { x: number; y: number; r: number }[] = [];
      const n = 12 + v * 2;
      for (let i = 0; i < n; i++) {
        const x = 70 + hash(v * 50 + i * 1.3) * 280;
        const edge = Math.abs(x - 210) / 210;
        const r = (30 + hash(v * 31 + i * 2.1) * 30) * (1 - edge * 0.45);
        const y = 118 - r * 0.5 - hash(v * 17 + i * 3.7) * 26 * (1 - edge);
        puffs.push({ x, y, r });
      }
      for (const p of puffs) {
        const gr = g.createRadialGradient(p.x, p.y + 9, 0, p.x, p.y + 9, p.r);
        gr.addColorStop(0, c(shade, 0.95));
        gr.addColorStop(1, c(shade, 0));
        g.fillStyle = gr;
        g.beginPath();
        g.arc(p.x, p.y + 9, p.r, 0, Math.PI * 2);
        g.fill();
      }
      for (const p of puffs) {
        const gr = g.createRadialGradient(p.x, p.y - 5, 0, p.x, p.y - 5, p.r * 0.95);
        gr.addColorStop(0, c(top, 0.98));
        gr.addColorStop(0.6, c(top, 0.8));
        gr.addColorStop(1, c(top, 0));
        g.fillStyle = gr;
        g.beginPath();
        g.arc(p.x, p.y - 5, p.r * 0.95, 0, Math.PI * 2);
        g.fill();
      }
      g.globalCompositeOperation = 'destination-out';
      const fl = g.createLinearGradient(0, 118, 0, 150);
      fl.addColorStop(0, 'rgba(0,0,0,0)');
      fl.addColorStop(1, 'rgba(0,0,0,1)');
      g.fillStyle = fl;
      g.fillRect(0, 118, 420, 62);
      out.push(cv);
    }
    return out;
  }

  // ---------------------------------------------------------------- camera
  private updateCamera(sim: Sim, dt: number): void {
    const cam = this.cam;
    const spd = sim.tas;
    // Zoom follows the aircraft: fast jets pull the camera back, but the scale
    // never collapses so far that the airframe disappears. `userZoom` (+/− or the
    // wheel) multiplies everything, including the size of the aircraft itself.
    const target = clamp(4.2 / (1 + Math.pow(spd / 110, 1.05)), 1.7, 4.2) * this.userZoom;
    if (!this.initCam) {
      cam.zoom = target;
      this.initCam = true;
    }
    cam.zoom += (target - cam.zoom) * (1 - Math.exp(-dt * 1.6));
    const vw = this.W / cam.zoom;
    const vh = this.H / cam.zoom;
    const vxw = sim.alive ? sim.worldVx : 0;
    const tl = clamp(vxw * 0.55, -0.2 * vw, 0.2 * vw);
    cam.leadX += (tl - cam.leadX) * (1 - Math.exp(-dt * 2.4));
    const tly = clamp(sim.vy * 0.35, -0.14 * vh, 0.14 * vh);
    cam.leadY += (tly - cam.leadY) * (1 - Math.exp(-dt * 2.4));
    cam.x = sim.x + cam.leadX;
    cam.y = sim.y + cam.leadY + 0.03 * vh;
  }

  // ---------------------------------------------------------------- main frame
  frame(sim: Sim, dt: number, extra: HudExtra): void {
    const ctx = this.ctx;
    this.fps += (1 / Math.max(dt, 0.001) - this.fps) * 0.05;
    extra.fps = this.fps;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.updateCamera(sim, dt);
    this.updateMood(sim);
    const { W, H } = this;
    ctx.save();
    const sh = sim.shake * 10 + sim.stallWarn * 2.2;
    if (sh > 0.05) ctx.translate((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh);

    this.drawSky(sim);
    this.drawFarLayers(sim);
    this.drawCloudLayer(sim, 'far');
    this.drawTerrainAndWater(sim);
    this.drawWorldFeatures(sim);
    if (sim.carrier) this.drawCarrier(sim);
    this.drawGates(sim);
    this.drawWindStreaks(sim);
    this.drawCloudLayer(sim, 'back');
    this.drawParticles(sim, false);
    this.drawPlane(sim);
    this.drawParticles(sim, true);
    this.drawCloudLayer(sim, 'front');
    this.drawPrecipitation(sim);
    this.drawFog(sim);
    ctx.restore();
    this.drawLightning(sim);

    // post effects
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, `rgba(0,0,0,${this.tod.night ? 0.5 : 0.28})`);
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
    if (sim.g > 5 && sim.alive) {
      const a = clamp((sim.g - 5) / 4.5, 0, 0.92);
      const bg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * (0.5 - a * 0.4), W / 2, H / 2, Math.max(W, H) * 0.7);
      bg.addColorStop(0, 'rgba(0,0,0,0)');
      bg.addColorStop(1, `rgba(0,0,0,${a})`);
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
    } else if (sim.g < -1.5 && sim.alive) {
      ctx.fillStyle = `rgba(180,0,0,${clamp((-sim.g - 1.5) / 4, 0, 0.45)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (sim.hitFlash > 0) {
      ctx.fillStyle = `rgba(255,220,160,${sim.hitFlash * 0.6})`;
      ctx.fillRect(0, 0, W, H);
    }
    drawHUD(ctx, W, H, sim, extra);
  }

  // ---------------------------------------------------------------- sky
  private horizonY(): number {
    return clamp(this.H / 2 + this.cam.y * this.cam.zoom * 0.1, this.H * 0.28, this.H * 1.05);
  }

  private drawSky(sim: Sim): void {
    const { ctx, W, H, tod } = this;
    const altT = clamp(this.cam.y / 18000, 0, 1);
    let top: number[] = mixRGB(tod.skyTop, [2, 4, 14], altT * 0.85);
    let mid: number[] = mixRGB(tod.skyMid, tod.skyTop, altT * 0.6);
    let bot: number[] = mixRGB(tod.skyBot, tod.skyMid, altT * 0.5);
    // weather gloom + a fog band hugging the horizon when visibility is low
    const gloom = clamp(this.mood.cover * 0.6 + (this.mood.storm ? 0.32 : 0) + this.mood.precip * 0.25, 0, 1);
    if (gloom > 0.02) {
      const night = tod.night;
      top = this.wxTint(top, gloom * 0.85, night);
      mid = this.wxTint(mid, gloom * 0.78, night);
      bot = this.wxTint(bot, gloom * 0.66, night);
    }
    const fogAmt = clamp(1 - this.mood.vis / 9000, 0, 1);
    if (fogAmt > 0.02) {
      const fogCol: number[] = tod.night ? [22, 26, 36] : this.mood.storm ? [96, 100, 112] : [186, 192, 200];
      bot = mixRGB(bot, fogCol, fogAmt * 0.85);
      mid = mixRGB(mid, fogCol, fogAmt * 0.42);
    }
    const hy = this.horizonY();
    const g = ctx.createLinearGradient(0, 0, 0, hy);
    g.addColorStop(0, this.raw(top));
    g.addColorStop(0.6, this.raw(mid));
    g.addColorStop(1, this.raw(bot));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (hy < H) {
      ctx.fillStyle = this.raw(bot);
      ctx.fillRect(0, hy, W, H - hy);
    }
    // stars
    const starA = clamp(tod.stars + altT * 0.8, 0, 1);
    if (starA > 0.02) {
      for (const s of this.stars) {
        const tw = 0.6 + 0.4 * Math.sin(sim.time * 2 + s.t);
        ctx.fillStyle = `rgba(255,255,255,${starA * tw * 0.9})`;
        const px = (s.x * W * 1.2 - this.cam.x * 0.01 * this.cam.zoom) % W;
        ctx.fillRect(px < 0 ? px + W : px, s.y * hy * 0.95, s.r, s.r);
      }
    }
    // sun / moon
    const sunX = W * 0.74;
    let sunY = tod.sunLow ? hy - 70 : H * 0.17;
    sunY = Math.max(sunY, H * 0.12);
    const night = tod.night;
    const sc = tod.sun;
    const glowR = night ? 160 : tod.sunLow ? 420 : 320;
    const gl = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, glowR);
    gl.addColorStop(0, this.raw(sc, night ? 0.25 : 0.6));
    gl.addColorStop(0.3, this.raw(sc, night ? 0.1 : 0.2));
    gl.addColorStop(1, this.raw(sc, 0));
    ctx.fillStyle = gl;
    ctx.fillRect(sunX - glowR, sunY - glowR, glowR * 2, glowR * 2);
    ctx.fillStyle = this.raw(night ? [236, 240, 250] : sc);
    ctx.beginPath();
    ctx.arc(sunX, sunY, night ? 26 : 34, 0, Math.PI * 2);
    ctx.fill();
    if (night) {
      ctx.fillStyle = this.raw(mid);
      ctx.beginPath();
      ctx.arc(sunX + 11, sunY - 5, 23, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawFarLayers(sim: Sim): void {
    const { ctx, W, H, cam } = this;
    const carrier = sim.mode === 'carrier';
    const layers = [
      { sc: 0.05, A: 2200, f: 1 / 9000, seed: 3, mix: 0.8 },
      { sc: 0.1, A: 1500, f: 1 / 5200, seed: 5, mix: 0.62 },
      { sc: 0.2, A: 950, f: 1 / 3000, seed: 7, mix: 0.42 },
    ];
    const bot = this.tod.skyBot;
    const hazeBase = carrier ? [60, 92, 120] : [78, 98, 128];
    for (const L of layers) {
      const kz = cam.zoom * L.sc;
      const base = H / 2 + cam.y * kz;
      const col = mixRGB(
        mixRGB(hazeBase, [0, 0, 0], 0).map((v, i) => v * this.light[i]),
        bot,
        L.mix,
      );
      ctx.fillStyle = this.raw(col);
      ctx.beginPath();
      ctx.moveTo(0, H + 2);
      for (let px = 0; px <= W + 8; px += 8) {
        const xl = cam.x + (px - W / 2) / kz;
        let hl: number;
        if (carrier) hl = L.A * 0.25 * Math.max(0, fbm(xl * L.f * 1.6, L.seed, 4) - 0.6) * 3;
        else hl = L.A * Math.max(0, fbm(xl * L.f, L.seed, 4) - 0.32) * 1.8;
        ctx.lineTo(px, base - hl * kz);
      }
      ctx.lineTo(W + 8, H + 2);
      ctx.closePath();
      ctx.fill();
      if (carrier) {
        // sea behind the islands
        const sea = mixRGB(this.tod.sea, bot, L.mix * 0.8).map((v, i) => v * this.light[i]);
        ctx.fillStyle = this.raw(sea);
        ctx.fillRect(0, base, W, H - base + 2);
      } else {
        ctx.fillStyle = this.raw(col);
        ctx.fillRect(0, base, W, H - base + 2);
      }
    }
  }

  // ---------------------------------------------------------------- clouds
  private drawCloudLayer(sim: Sim, layer: 'far' | 'back' | 'front'): void {
    const { ctx, W, H, cam } = this;
    // rebuild the cloud canvases once the hand-drawn cumulus has decoded
    if (!this.cloudsFromSprite && decorSprite(DECOR.cloud)) {
      this.cloudsFromSprite = true;
      this.buildClouds();
    }
    if (this.clouds.length === 0) return;
    const far = layer === 'far';
    const kz = far ? cam.zoom * 0.3 : cam.zoom;
    const cellW = far ? 700 : 1100;
    const i0 = Math.floor((cam.x - W / 2 / kz) / cellW) - 2;
    const i1 = Math.floor((cam.x + W / 2 / kz) / cellW) + 2;
    const wx = sim.weather;
    const deck = wx.coverNow;
    const stormy = wx.preset.storm || deck > 0.86 || this.mood.precip > 0.3;
    const set = stormy ? this.cloudsDark : this.clouds;
    for (let i = i0; i <= i1; i++) {
      const seed = far ? i + 5000 : i;
      const isFront = hash(seed * 9.7) < 0.3;
      if (!far && (layer === 'front') !== isFront) continue;
      const alt = far ? 700 + hash(seed * 3.1) * 3200 : 1100 + hash(seed * 3.1) * 4300;
      const cx = i * cellW + hash(seed * 2.3) * cellW * 0.6;
      const cov = wx.cloudAt(cx, alt);
      if (cov < 0.06) continue;
      const cw = ((far ? 500 : 650) + hash(seed * 7.7) * (far ? 500 : 950)) * (0.8 + cov * 0.85);
      const ch = (cw * 180) / 420;
      const px = W / 2 + (cx - cam.x) * kz;
      const py = H / 2 + (cam.y - alt) * kz;
      const w = cw * kz;
      const h = ch * kz;
      if (px + w / 2 < 0 || px - w / 2 > W || py + h / 2 < 0 || py - h / 2 > H) continue;
      const variant = Math.floor(hash(seed * 5.3) * 3) % 3;
      const base = far ? 0.5 : layer === 'front' ? 0.55 : 0.95;
      ctx.globalAlpha = clamp(base * (0.35 + cov * 1.1), 0, 1);
      ctx.drawImage(set[variant], px - w / 2, py - h / 2, w, h);
      ctx.globalAlpha = 1;
    }
  }

  // ---------------------------------------------------------------- terrain & water
  private drawTerrainAndWater(sim: Sim): void {
    const { ctx, W, H, cam } = this;
    const z = cam.zoom;
    const step = 4;
    const n = Math.ceil(W / step) + 2;
    if (this.hbuf.length < n) this.hbuf = new Float32Array(n + 64);
    const hb = this.hbuf;
    let maxH = -1e9;
    for (let i = 0; i < n; i++) {
      const wx = cam.x + (i * step - W / 2) / z;
      const h = terrainHeight(wx, sim.mode);
      hb[i] = h;
      if (h > maxH) maxH = h;
    }
    const t = sim.time;
    // land
    if (maxH > -120) {
      const g = ctx.createLinearGradient(0, this.sy(3000), 0, this.sy(-300));
      for (const [alt, c] of TERRAIN_STOPS) g.addColorStop(clamp((3000 - alt) / 3300, 0, 1), this.lit(c));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, H + 6);
      for (let i = 0; i < n; i++) ctx.lineTo(i * step, Math.min(this.sy(hb[i]), H + 6));
      ctx.lineTo((n - 1) * step, H + 6);
      ctx.closePath();
      ctx.fill();
      // ridge highlight
      ctx.strokeStyle = this.lit([255, 255, 255], 0.16);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < n; i++) {
        if (hb[i] <= 0) {
          started = false;
          continue;
        }
        const y = this.sy(hb[i]);
        if (!started) {
          ctx.moveTo(i * step, y);
          started = true;
        } else ctx.lineTo(i * step, y);
      }
      ctx.stroke();
    }
    // water
    const seaTop = this.sy(0);
    if (seaTop < H + 20) {
      const wg = ctx.createLinearGradient(0, seaTop, 0, this.sy(-500));
      const sea = this.tod.sea;
      const deep = this.tod.seaDeep;
      wg.addColorStop(0, this.lit(sea, 0.96));
      wg.addColorStop(0.06, this.lit(mixRGB(sea, deep, 0.5), 0.98));
      wg.addColorStop(0.3, this.lit(deep, 1));
      wg.addColorStop(1, this.lit(mixRGB(deep, [0, 0, 0], 0.5), 1));
      ctx.fillStyle = wg;
      let i = 0;
      while (i < n) {
        if (hb[i] >= 0) {
          i++;
          continue;
        }
        let j = i;
        while (j < n && hb[j] < 0) j++;
        const a = Math.max(0, i - 1);
        const b = Math.min(n - 1, j);
        ctx.beginPath();
        for (let k = a; k <= b; k++) {
          const wx = cam.x + (k * step - W / 2) / z;
          const wave = (Math.sin(wx * 0.07 + t * 1.4) * 0.35 + Math.sin(wx * 0.19 - t * 2.1) * 0.2 + Math.sin(wx * 0.021 + t * 0.6) * 0.5) * this.mood.sea;
          const y = seaTop - wave * z * 0.8;
          if (k === a) ctx.moveTo(k * step, y);
          else ctx.lineTo(k * step, y);
        }
        for (let k = b; k >= a; k--) ctx.lineTo(k * step, Math.min(Math.max(this.sy(hb[k]), seaTop), H + 8));
        ctx.closePath();
        ctx.fill();
        // glints
        for (let k = a; k <= b; k += 2) {
          const wx = cam.x + (k * step - W / 2) / z;
          const bucket = Math.floor(wx / 7);
          if (hash(bucket * 1.3) > 0.82) {
            const depth = hash(bucket * 2.9) * 70;
            const gy = seaTop + 2 + depth * (0.4 + z * 0.15);
            const flick = 0.5 + 0.5 * Math.sin(t * 3 + bucket);
            ctx.fillStyle = `rgba(255,255,255,${(0.1 + 0.25 * (1 - depth / 70)) * flick * (this.tod.night ? 0.3 : 1)})`;
            ctx.fillRect(k * step, gy, 4 + hash(bucket * 4.1) * 16, 1.3);
          }
        }
        // surface highlight
        ctx.strokeStyle = this.lit([255, 255, 255], 0.35);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        for (let k = a; k <= b; k++) {
          const wx = cam.x + (k * step - W / 2) / z;
          const wave = (Math.sin(wx * 0.07 + t * 1.4) * 0.35 + Math.sin(wx * 0.19 - t * 2.1) * 0.2 + Math.sin(wx * 0.021 + t * 0.6) * 0.5) * this.mood.sea;
          const y = seaTop - wave * z * 0.8;
          if (k === a) ctx.moveTo(k * step, y);
          else ctx.lineTo(k * step, y);
        }
        ctx.stroke();
        i = j;
      }
    }
  }

  // ---------------------------------------------------------------- world features
  private drawWorldFeatures(sim: Sim): void {
    if (sim.mode !== 'open') return;
    const { cam, W } = this;
    const z = cam.zoom;
    const x0 = cam.x - W / 2 / z;
    const x1 = cam.x + W / 2 / z;
    this.drawVillages(sim, x0, x1);
    this.drawInfrastructure(sim, x0, x1);
    if (z > 0.7) this.drawTrees(sim, x0, x1);
    for (const ap of airportsNear(cam.x, 1)) {
      if (ap.x + ap.len / 2 + 400 < x0 || ap.x - ap.len / 2 - 400 > x1) continue;
      this.drawAirport(sim, ap);
    }
  }

  /** Ambient brightness for scenery sprites (night and storm gloom dim them). */
  private spriteBright(): number {
    const storminess = this.mood.storm ? 0.18 : 0;
    return clamp(0.42 + this.light[0] * 0.5 - this.mood.cover * 0.22 - storminess, 0.22, 1.05);
  }

  /** distance haze colour + strength for scenery sprites near the horizon */
  private decorHaze(wx: number): { col: string; a: number } {
    const d = Math.abs(wx - this.cam.x);
    const a = clamp((d - 900) / 5200, 0, 0.62) * (0.5 + this.mood.cover * 0.3);
    const night = this.tod.night;
    const sky = this.tod.skyBot;
    const r = Math.round(sky[0] * (night ? 0.5 : 0.94));
    const g = Math.round(sky[1] * (night ? 0.55 : 0.95));
    const b = Math.round(sky[2] * (night ? 0.6 : 0.97));
    return { col: `rgb(${r},${g},${b})`, a };
  }

  /**
   * Draw a scenery sprite standing on the terrain, given its real height in
   * metres. Returns false when there is nothing to draw (still loading).
   */
  private decor(key: DecorKey, wx: number, heightM: number, mode: WorldMode, opts: { flip?: boolean; ground?: number } = {}): boolean {
    const spr = decorSprite(DECOR[key]);
    if (!spr) return false;
    const z = this.cam.zoom;
    const ground = opts.ground ?? terrainHeight(wx, mode);
    const hpx = heightM * z;
    if (hpx < 2.5) return false;
    const px = this.sx(wx);
    if (px < -hpx * spr.aspect - 40 || px > this.W + hpx * spr.aspect + 40) return false;
    const baseY = this.sy(ground);
    const h = hpx;
    const w = h * spr.aspect;
    drawDecorSprite(this.ctx, spr, px, baseY, hpx, {
      flip: opts.flip,
      bright: this.spriteBright(),
      alpha: clamp(1 - (1 - this.mood.vis / 9000) * 0.35, 0.5, 1),
    });
    // fade distant scenery into the horizon
    const haze = this.decorHaze(wx);
    if (haze.a > 0.02) {
      this.ctx.globalAlpha = haze.a;
      this.ctx.fillStyle = haze.col;
      this.ctx.fillRect(px - w / 2, baseY - h, w, h);
      this.ctx.globalAlpha = 1;
    }
    return true;
  }

  /** Masts and wind farms, scattered where they make sense. */
  private drawInfrastructure(sim: Sim, x0: number, x1: number): void {
    const mode = sim.mode;
    const { cam } = this;
    const z = cam.zoom;
    if (z < 0.5) return;
    // lighthouses: on headlands where the sea meets rising ground
    const lstep = 2100;
    for (let i = Math.floor(x0 / lstep) - 1; i <= Math.floor(x1 / lstep) + 1; i++) {
      if (hash(i * 7.1 + 23) < 0.62) continue;
      const wx = (i + hash(i * 5.5)) * lstep;
      const h = terrainHeight(wx, sim.mode);
      const back = terrainHeight(wx + 120, sim.mode);
      if (h < 8 || h > 60) continue;
      if (back < h + 25) continue; // must be a promontory, not a beach
      if (airportAt(wx, 800)) continue;
      const ok = this.decor('lighthouse', wx, 26, sim.mode, { ground: h });
      if (ok && this.tod.night) {
        const on = Math.floor(sim.time * 0.5) % 2 === 0;
        this.glowDot(this.sx(wx), this.sy(h) - 25 * this.cam.zoom, 14, on ? [255, 240, 190] : [120, 120, 110], on ? 0.85 : 0.2);
      }
    }
    // telecom masts: one every few km on high-ish ground
    const mstep = 2600;
    for (let i = Math.floor(x0 / mstep) - 1; i <= Math.floor(x1 / mstep) + 1; i++) {
      if (hash(i * 5.7 + 11) < 0.55) continue;
      const wx = (i + hash(i * 2.1)) * mstep;
      const h = terrainHeight(wx, sim.mode);
      if (h < 30 || h > 1400) continue;
      if (airportAt(wx, 700)) continue;
      this.decor('mast', wx, 32 + hash(i * 3.9) * 26, mode, { ground: h });
    }
    // wind farms: a run of turbines along windy ridges
    const wstep = 3400;
    for (let i = Math.floor(x0 / wstep) - 1; i <= Math.floor(x1 / wstep) + 1; i++) {
      if (hash(i * 8.3 + 5) < 0.62) continue;
      const cx = (i + hash(i * 4.4)) * wstep;
      const n = 3 + Math.floor(hash(i * 6.6) * 5);
      for (let j = 0; j < n; j++) {
        const wx = cx + j * (55 + hash(i + j) * 40);
        const h = terrainHeight(wx, sim.mode);
        if (h < 90 || h > 1500) continue;
        if (airportAt(wx, 900)) continue;
        this.decor('turbine', wx, 62 + hash(i * 2.9 + j) * 34, mode, { ground: h, flip: hash(wx) > 0.5 });
      }
    }
  }

  private drawTrees(sim: Sim, x0: number, x1: number): void {
    const { ctx, cam } = this;
    const z = cam.zoom;
    const step = z > 2 ? 11 : z > 1.2 ? 20 : 38;
    const i0 = Math.floor(x0 / step) - 1;
    const i1 = Math.floor(x1 / step) + 1;
    for (let i = i0; i <= i1; i++) {
      const wx = (i + hash(i * 0.37)) * step;
      const dens = smoothstep(0.38, 0.66, fbm(wx / 700, 51, 3));
      if (hash(i * 1.91 + 3) > dens * 0.9) continue;
      const h = terrainHeight(wx, sim.mode);
      if (h < 6 || h > 1250) continue;
      if (airportAt(wx, 260)) continue;
      const ht = (5 + hash(i * 2.7) * 8) * (1 - smoothstep(600, 1250, h) * 0.5);
      const px = this.sx(wx);
      const py = this.sy(h);
      const conifer = h > 420 || hash(i * 4.3) > 0.62;
      const wd = ht * 0.55 * z;
      const hh = ht * z;
      const spr = decorSprite(DECOR[conifer ? 'pine' : 'oak']);
      if (spr) {
        // sprites are a bit taller than the old vector trees: keep the same footprint
        const th = ht * 1.35 * z;
        const tw = th * spr.aspect;
        drawDecorSprite(ctx, spr, px, py, th, {
          bright: this.spriteBright(),
          flip: hash(i * 9.1) > 0.5,
          alpha: clamp(1 - (1 - this.mood.vis / 9000) * 0.35, 0.5, 1),
        });
        const haze = this.decorHaze(wx);
        if (haze.a > 0.02) {
          ctx.globalAlpha = haze.a;
          ctx.fillStyle = haze.col;
          ctx.fillRect(px - tw / 2, py - th, tw, th);
          ctx.globalAlpha = 1;
        }
        continue;
      }
      if (conifer) {
        ctx.fillStyle = this.lit([76, 54, 34]);
        ctx.fillRect(px - 0.06 * hh, py - hh * 0.2, 0.12 * hh, hh * 0.2);
        ctx.fillStyle = this.lit([30 + hash(i) * 14, 76 + hash(i * 3) * 18, 46]);
        for (let k = 0; k < 3; k++) {
          const by = py - hh * (0.12 + k * 0.28);
          const bw = wd * (1 - k * 0.26);
          ctx.beginPath();
          ctx.moveTo(px - bw, by);
          ctx.lineTo(px + bw, by);
          ctx.lineTo(px, by - hh * 0.4);
          ctx.closePath();
          ctx.fill();
        }
      } else {
        ctx.fillStyle = this.lit([86, 60, 38]);
        ctx.fillRect(px - 0.05 * hh, py - hh * 0.45, 0.1 * hh, hh * 0.45);
        ctx.fillStyle = this.lit([54 + hash(i * 5) * 30, 112 + hash(i * 6) * 30, 50]);
        ctx.beginPath();
        ctx.arc(px, py - hh * 0.62, wd * 0.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = this.lit([255, 255, 200], 0.1);
        ctx.beginPath();
        ctx.arc(px + wd * 0.2, py - hh * 0.7, wd * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawVillages(sim: Sim, x0: number, x1: number): void {
    const { ctx, cam } = this;
    const z = cam.zoom;
    if (z < 0.55) return;
    const night = this.tod.night;
    const v0 = Math.floor(x0 / 800) - 1;
    const v1 = Math.floor(x1 / 800) + 1;
    for (let vi = v0; vi <= v1; vi++) {
      if (hash(vi * 3.3 + 1) < 0.5) continue;
      const cx = vi * 800 + hash(vi * 1.1) * 500;
      const nh = 4 + Math.floor(hash(vi * 2.2) * 5);
      for (let j = 0; j < nh; j++) {
        const wx = cx + j * 17 + hash(vi * 7 + j) * 6;
        const h = terrainHeight(wx, sim.mode);
        if (h < 4 || h > 520 || airportAt(wx, 380)) continue;
        if (Math.abs(terrainHeight(wx + 10, sim.mode) - h) > 3) continue;
        const w = 8 + hash(vi * 5 + j * 1.7) * 6;
        const hh = 4 + hash(vi * 9 + j * 2.3) * 3;
        const px = this.sx(wx);
        const py = this.sy(h);
        // bigger settlements get apartment blocks and the odd barn
        const townish = hash(vi * 4.7) > 0.45;
        const hpick = hash(vi * 6.1 + j * 2.9);
        const hkey: DecorKey = townish ? (hpick > 0.45 ? 'block' : 'house') : hpick > 0.75 ? 'barn' : 'house';
        const hspr = decorSprite(DECOR[hkey]);
        if (hspr) {
          // the artwork includes the roof, so it stands a bit taller than the walls
          const bh = (hh + 3.2) * z * (hkey === 'block' ? 1.9 : 1);
          const bw = bh * hspr.aspect;
          const hx = px + (w / 2) * z;
          drawDecorSprite(ctx, hspr, hx, py, bh, {
            bright: this.spriteBright(),
            flip: hash(vi * 3 + j * 9) > 0.5,
            alpha: clamp(1 - (1 - this.mood.vis / 9000) * 0.35, 0.5, 1),
          });
          const haze = this.decorHaze(wx);
          if (haze.a > 0.02) {
            ctx.globalAlpha = haze.a;
            ctx.fillStyle = haze.col;
            ctx.fillRect(hx - bw / 2, py - bh, bw, bh);
            ctx.globalAlpha = 1;
          }
          const lightOn = night && hash(vi * 3 + j) > 0.35;
          if (lightOn) this.glowDot(px + w * 0.3 * z, py - hh * 0.6 * z, 5 * z, [255, 214, 120], 0.55);
          continue;
        }
        const wallC = [[232, 220, 196], [214, 196, 170], [196, 206, 214], [226, 190, 170]][Math.floor(hash(vi + j * 4.1) * 4) % 4];
        ctx.fillStyle = this.lit(wallC);
        ctx.fillRect(px, py - hh * z, w * z, hh * z);
        ctx.fillStyle = this.lit([150, 68, 52]);
        ctx.beginPath();
        ctx.moveTo(px - 0.8 * z, py - hh * z);
        ctx.lineTo(px + (w + 0.8) * z, py - hh * z);
        ctx.lineTo(px + (w / 2) * z, py - (hh + 3) * z);
        ctx.closePath();
        ctx.fill();
        const lightOn = night && hash(vi * 3 + j) > 0.35;
        ctx.fillStyle = lightOn ? 'rgba(255,214,120,0.95)' : this.lit([70, 90, 110]);
        ctx.fillRect(px + w * 0.2 * z, py - hh * 0.75 * z, 1.6 * z, 1.5 * z);
        ctx.fillRect(px + w * 0.62 * z, py - hh * 0.75 * z, 1.6 * z, 1.5 * z);
      }
    }
  }

  private drawAirport(sim: Sim, ap: Airport): void {
    const { ctx, cam } = this;
    const z = cam.zoom;
    const night = this.tod.night;
    const yT = this.sy(ap.elev);
    const x0 = this.sx(ap.x - ap.len / 2);
    const x1 = this.sx(ap.x + ap.len / 2);
    const bx = (off: number) => this.sx(ap.x + off);

    // hangars
    for (const off of [-ap.len * 0.2, -ap.len * 0.2 + 60, ap.len * 0.26]) {
      const px = bx(off);
      const w = 44 * z;
      const h = 15 * z;
      ctx.fillStyle = this.lit([150, 158, 168]);
      ctx.beginPath();
      ctx.moveTo(px, yT);
      ctx.lineTo(px, yT - h * 0.6);
      ctx.quadraticCurveTo(px + w / 2, yT - h * 1.25, px + w, yT - h * 0.6);
      ctx.lineTo(px + w, yT);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = this.lit([60, 66, 76]);
      ctx.fillRect(px + w * 0.18, yT - h * 0.55, w * 0.64, h * 0.55);
      ctx.strokeStyle = this.lit([110, 116, 126], 0.6);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = 1; k < 6; k++) {
        ctx.moveTo(px + (w * k) / 6, yT);
        ctx.lineTo(px + (w * k) / 6, yT - h * (0.95 - Math.abs(k - 3) * 0.12));
      }
      ctx.stroke();
    }
    // terminal
    const tx = bx(ap.len * 0.08);
    ctx.fillStyle = this.lit([218, 220, 226]);
    ctx.fillRect(tx, yT - 13 * z, 120 * z, 13 * z);
    ctx.fillStyle = this.lit([40, 70, 100]);
    ctx.fillRect(tx + 4 * z, yT - 9 * z, 112 * z, 4.5 * z);
    ctx.fillStyle = night ? 'rgba(255,230,160,0.9)' : this.lit([150, 190, 220]);
    for (let k = 0; k < 14; k++) ctx.fillRect(tx + (6 + k * 7.9) * z, yT - 8.5 * z, 5 * z, 3.5 * z);
    ctx.fillStyle = this.lit([180, 70, 60]);
    ctx.fillRect(tx - 2 * z, yT - 14.5 * z, 124 * z, 1.5 * z);
    // tower (hand-drawn ATC sprite, 38 m tall) with a beacon on top
    const tw = bx(ap.len * 0.08 + 135);
    const atcSpr = decorSprite(DECOR.atc);
    if (atcSpr) {
      const hpx = 38 * z;
      drawDecorSprite(ctx, atcSpr, tw + 2.5 * z, yT, hpx, { bright: this.spriteBright() });
      if (night) {
        const on = Math.floor(sim.time * 1.2) % 2 === 0;
        this.glowDot(tw + 2.5 * z, yT - hpx, 9, on ? [255, 60, 60] : [255, 255, 255], on ? 0.9 : 0.3);
      }
    } else {
    ctx.fillStyle = this.lit([200, 202, 208]);
    ctx.fillRect(tw, yT - 28 * z, 5 * z, 28 * z);
    ctx.fillStyle = this.lit([70, 90, 110]);
    ctx.fillRect(tw - 4 * z, yT - 34 * z, 13 * z, 6 * z);
    ctx.fillStyle = night ? 'rgba(255,230,150,0.95)' : this.lit([140, 190, 225]);
    ctx.fillRect(tw - 3 * z, yT - 33 * z, 11 * z, 3.6 * z);
    ctx.fillStyle = this.lit([210, 210, 215]);
    ctx.fillRect(tw - 5 * z, yT - 35 * z, 15 * z, 1.2 * z);
    ctx.strokeStyle = this.lit([200, 200, 200]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tw + 2.5 * z, yT - 35 * z);
    ctx.lineTo(tw + 2.5 * z, yT - 42 * z);
    ctx.stroke();
    if (night) {
      const on = Math.floor(sim.time * 1.2) % 2 === 0;
      this.glowDot(tw + 2.5 * z, yT - 42 * z, 9, on ? [255, 60, 60] : [255, 255, 255], on ? 0.9 : 0.3);
    }
    }
    // windsock
    const wsx = bx(ap.len / 2 - 220);
    ctx.strokeStyle = this.lit([220, 220, 220]);
    ctx.lineWidth = Math.max(1, 0.3 * z);
    ctx.beginPath();
    ctx.moveTo(wsx, yT);
    ctx.lineTo(wsx, yT - 10 * z);
    ctx.stroke();
    const sway = Math.sin(sim.time * 2) * 0.6 * z;
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = this.lit(k % 2 ? [250, 250, 250] : [236, 100, 40]);
      ctx.fillRect(wsx + k * 1.3 * z, yT - 10 * z + sway * (k / 3) + k * 0.3 * z, 1.3 * z, 1.6 * z - k * 0.25 * z);
    }

    // runway
    ctx.fillStyle = this.lit([56, 58, 64]);
    ctx.fillRect(x0, yT, x1 - x0, 3.4 * z);
    ctx.fillStyle = this.lit([98, 100, 108]);
    ctx.fillRect(x0, yT, x1 - x0, 1.2 * z);
    ctx.fillStyle = this.lit([240, 240, 240], 0.9);
    ctx.fillRect(x0, yT, x1 - x0, Math.max(1, 0.12 * z));
    if (z > 1.2) {
      ctx.fillStyle = this.lit([240, 240, 240], 0.85);
      const dashW = 30;
      const vx0 = Math.max(ap.x - ap.len / 2, cam.x - this.W / 2 / z);
      const vx1 = Math.min(ap.x + ap.len / 2, cam.x + this.W / 2 / z);
      for (let d = Math.floor(vx0 / 60) * 60; d < vx1; d += 60) {
        if (d < ap.x - ap.len / 2 + 120 || d > ap.x + ap.len / 2 - 120) continue;
        ctx.fillRect(this.sx(d), yT + 2 * z, dashW * z, 0.45 * z);
      }
    }
    // wet runway: mirror finish and standing water
    if (this.mood.wet > 0.18) {
      const a = 0.22 * this.mood.wet;
      const wg = ctx.createLinearGradient(0, yT - 1.5 * z, 0, yT + 3.5 * z);
      wg.addColorStop(0, `rgba(255,255,255,${a * 0.25})`);
      wg.addColorStop(0.45, `rgba(214,232,255,${a})`);
      wg.addColorStop(1, `rgba(150,178,214,${a * 0.45})`);
      ctx.fillStyle = wg;
      ctx.fillRect(x0, yT, x1 - x0, 3.4 * z);
      for (let k = 0; k < 9; k++) {
        const hx = ap.x - ap.len / 2 + ((k + 0.5) / 9) * ap.len;
        const hh = 0.6 + hash(k * 3.1 + ap.id) * 1.6;
        ctx.fillStyle = `rgba(255,255,255,${a * 0.5})`;
        ctx.fillRect(this.sx(hx), yT + 0.4 * z, hh * 6 * z, Math.max(1, 0.35 * z));
      }
    }
    // threshold bars
    ctx.fillStyle = this.lit([240, 240, 240], 0.9);
    for (let k = 0; k < 6; k++) {
      ctx.fillRect(this.sx(ap.x - ap.len / 2 + 6 + k * 3.2), yT + 0.3 * z, 1.5 * z, 2.6 * z);
      ctx.fillRect(this.sx(ap.x + ap.len / 2 - 6 - k * 3.2) - 1.5 * z, yT + 0.3 * z, 1.5 * z, 2.6 * z);
    }
    // lights
    const lightStep = night ? 50 : 120;
    const vxa = cam.x - this.W / 2 / z;
    const vxb = cam.x + this.W / 2 / z;
    for (let d = Math.ceil((Math.max(ap.x - ap.len / 2, vxa)) / lightStep) * lightStep; d <= Math.min(ap.x + ap.len / 2, vxb); d += lightStep) {
      if (night) this.glowDot(this.sx(d), yT - 0.4 * z, 4 + z * 0.8, [255, 245, 200], 0.85);
      else {
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillRect(this.sx(d), yT - 0.3 * z, Math.max(1, 0.5 * z), Math.max(1, 0.5 * z));
      }
    }
    // approach lights
    for (const dir of [-1, 1]) {
      for (let k = 1; k <= 10; k++) {
        const wx = ap.x + dir * (ap.len / 2 + k * 45);
        const px = this.sx(wx);
        if (px < -20 || px > this.W + 20) continue;
        const gh = terrainHeight(wx, sim.mode);
        const py = this.sy(gh);
        ctx.strokeStyle = this.lit([180, 180, 180]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px, py - 2.5 * z);
        ctx.stroke();
        if (night) {
          const chase = (Math.floor(sim.time * 8) % 10) === (dir === -1 ? 10 - k : k - 1) % 10;
          this.glowDot(px, py - 2.5 * z, chase ? 9 : 5, chase ? [255, 255, 255] : [255, 120, 80], chase ? 1 : 0.75);
        } else {
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          ctx.fillRect(px - 1, py - 2.5 * z - 1, 2, 2);
        }
      }
    }
    // label
    const lx = this.sx(ap.x);
    ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    const txt = ap.name.toUpperCase();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillText(txt, lx + 1, yT - 52 * Math.min(z, 2) + 1);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(txt, lx, yT - 52 * Math.min(z, 2));
    ctx.textAlign = 'start';
  }

  private glowDot(x: number, y: number, r: number, c: number[], a: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, this.raw(c, a));
    g.addColorStop(0.35, this.raw(c, a * 0.4));
    g.addColorStop(1, this.raw(c, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ---------------------------------------------------------------- carrier
  private drawCarrier(sim: Sim): void {
    const c = sim.carrier;
    if (!c) return;
    const { ctx, cam } = this;
    const z = cam.zoom;
    const night = this.tod.night;
    // escorts
    for (const off of [1900, -2300]) this.drawEscort(sim, c.x + off, z);
    const px = this.sx(c.x);
    if (px > this.W + 200 * z || px + (CARRIER_LEN + 40) * z < -200) return;
    ctx.save();
    ctx.translate(px, this.sy(0));
    ctx.scale(z, -z);
    const L = CARRIER_LEN;
    // wake
    ctx.save();
    for (let i = 0; i < 16; i++) {
      const s = -10 - ((i * 16 + sim.time * 14) % 250);
      const a = 0.4 * (1 - -s / 260);
      ctx.fillStyle = `rgba(255,255,255,${a * (night ? 0.4 : 1)})`;
      ctx.beginPath();
      ctx.ellipse(s, 0.3, 8 + -s * 0.05, 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    // hull
    const hg = ctx.createLinearGradient(0, DECK_H, 0, -9);
    hg.addColorStop(0, this.lit([138, 146, 156]));
    hg.addColorStop(0.45, this.lit([84, 92, 104]));
    hg.addColorStop(0.55, this.lit([64, 70, 80]));
    hg.addColorStop(0.62, this.lit([120, 40, 36]));
    hg.addColorStop(1, this.lit([92, 28, 26]));
    ctx.fillStyle = hg;
    ctx.beginPath();
    ctx.moveTo(-4, DECK_H - 1);
    ctx.lineTo(-6, 12);
    ctx.quadraticCurveTo(-8, 0, 30, -9);
    ctx.lineTo(L - 40, -9);
    ctx.quadraticCurveTo(L + 8, 0, L + 20, DECK_H - 10);
    ctx.quadraticCurveTo(L + 24, DECK_H - 3, L + 8, DECK_H);
    ctx.lineTo(-4, DECK_H);
    ctx.closePath();
    ctx.fill();
    // hull details: sponsons & windows
    ctx.fillStyle = this.lit([50, 56, 64]);
    for (let s = 20; s < L - 20; s += 14) ctx.fillRect(s, DECK_H - 4.5, 5, 1.5);
    ctx.fillStyle = this.lit([110, 118, 128]);
    ctx.fillRect(-4, DECK_H - 1.6, L + 12, 0.5);
    // flight deck slab
    ctx.fillStyle = this.lit([84, 88, 94]);
    ctx.fillRect(-4, DECK_H - 1.1, L + 10, 1.1);
    ctx.fillStyle = this.lit([128, 132, 138]);
    ctx.fillRect(-4, DECK_H - 0.25, L + 10, 0.3);
    // deck markings
    ctx.fillStyle = this.lit([250, 250, 250], 0.85);
    for (let s = 6; s < L - 4; s += 12) ctx.fillRect(s, DECK_H - 0.65, 6, 0.22);
    // catapult track
    ctx.fillStyle = this.lit([250, 210, 60], 0.95);
    ctx.fillRect(CAT_START - 6, DECK_H - 0.1, CAT_END - CAT_START + 6, 0.2);
    ctx.fillRect(CAT_START - 6, DECK_H, 1, 0.9);
    // wires
    for (const w of WIRES) {
      ctx.fillStyle = this.lit([30, 30, 34]);
      ctx.fillRect(w - 0.25, DECK_H, 0.5, 0.35);
    }
    ctx.fillStyle = this.lit([255, 120, 40]);
    ctx.fillRect(WIRES[0] - 6, DECK_H - 0.9, 0.7, 0.7);
    // island superstructure (far side)
    ctx.fillStyle = this.lit([104, 112, 122]);
    ctx.fillRect(188, DECK_H, 52, 8);
    ctx.fillStyle = this.lit([118, 126, 136]);
    ctx.fillRect(194, DECK_H + 8, 36, 7);
    ctx.fillStyle = this.lit([128, 136, 146]);
    ctx.fillRect(200, DECK_H + 15, 20, 6);
    ctx.fillStyle = this.lit([40, 58, 78]);
    ctx.fillRect(196, DECK_H + 10.5, 32, 2.2);
    ctx.fillRect(202, DECK_H + 17, 16, 2.2);
    ctx.fillStyle = night ? 'rgba(255,220,140,0.95)' : this.lit([100, 140, 170]);
    for (let k = 0; k < 8; k++) ctx.fillRect(197 + k * 4, DECK_H + 10.8, 2.4, 1.5);
    ctx.strokeStyle = this.lit([70, 74, 80]);
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(210, DECK_H + 21);
    ctx.lineTo(210, DECK_H + 36);
    ctx.moveTo(204, DECK_H + 30);
    ctx.lineTo(216, DECK_H + 30);
    ctx.stroke();
    const ang = sim.time * 2.2;
    ctx.fillStyle = this.lit([180, 184, 190]);
    ctx.beginPath();
    ctx.ellipse(222, DECK_H + 24, 5 * Math.abs(Math.cos(ang)) + 0.8, 0.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = this.lit([200, 60, 50]);
    ctx.fillRect(188, DECK_H + 4, 52, 0.8);
    // numerals
    ctx.fillStyle = this.lit([240, 240, 240], 0.9);
    for (let k = 0; k < 2; k++) {
      ctx.fillRect(252 + k * 10, DECK_H - 0.9, 6, 0.3);
    }
    // water overlay on submerged hull
    ctx.fillStyle = this.lit(this.tod.sea, 0.6);
    ctx.fillRect(-12, -10, L + 50, 10);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(-8, -0.2, L + 36, 0.5);
    // bow wave
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.5 - i * 0.07})`;
      ctx.beginPath();
      ctx.ellipse(L + 12 + i * 2.5, 0.6 + (i % 2) * 0.6, 4, 1.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // deck lights
    if (night) {
      ctx.restore();
      ctx.save();
      for (let s = 0; s <= L; s += 10) {
        this.glowDot(px + s * z, this.sy(DECK_H), 4 + z, s < 20 ? [255, 70, 60] : s > 100 && s < 150 ? [90, 255, 120] : [255, 240, 200], 0.9);
      }
      ctx.restore();
      return;
    }
    ctx.restore();
  }

  private drawEscort(sim: Sim, wx: number, z: number): void {
    const { ctx } = this;
    const px = this.sx(wx);
    if (px < -200 * z || px > this.W + 200 * z) return;
    ctx.save();
    ctx.translate(px, this.sy(0));
    ctx.scale(z, -z);
    ctx.fillStyle = this.lit([100, 108, 118]);
    ctx.beginPath();
    ctx.moveTo(0, 7);
    ctx.lineTo(0, 5);
    ctx.lineTo(10, -3.5);
    ctx.lineTo(112, -3.5);
    ctx.lineTo(128, 8);
    ctx.lineTo(112, 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = this.lit([120, 128, 138]);
    ctx.fillRect(34, 8, 48, 7);
    ctx.fillRect(48, 15, 22, 5);
    ctx.fillStyle = this.lit([86, 92, 100]);
    ctx.fillRect(100, 8, 10, 3);
    ctx.strokeStyle = this.lit([80, 84, 90]);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(58, 20);
    ctx.lineTo(58, 36);
    ctx.moveTo(52, 28);
    ctx.lineTo(64, 28);
    ctx.moveTo(100, 11);
    ctx.lineTo(116, 12);
    ctx.stroke();
    ctx.fillStyle = this.lit(this.tod.sea, 0.55);
    ctx.fillRect(-4, -5, 140, 5);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(-4, -0.2, 140, 0.5);
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(255,255,255,${0.35 - i * 0.05})`;
      ctx.beginPath();
      ctx.ellipse(-6 - ((i * 14 + sim.time * 12) % 80), 0.3, 6, 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- mission gates
  private drawGates(sim: Sim): void {
    const run = sim.mission;
    if (!run) return;
    const { ctx } = this;
    const z = this.cam.zoom;
    const t = sim.time;
    const next = run.nextGate;
    for (const g of run.mission.gates) {
      if (g.passed) continue;
      const px = this.sx(g.x);
      if (px < -320 || px > this.W + 320) continue;
      const py = this.sy(g.y);
      const r = Math.max(7, g.r * z);
      const active = next === g;
      const col = g.kind === 'beacon' ? '#ffd24a' : '#5fe0ff';
      const pulse = 0.65 + 0.35 * Math.sin(t * 3.2);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (active ? 0.95 : 0.42) * pulse;
      ctx.strokeStyle = col;
      ctx.lineWidth = active ? 3.2 : 2;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha *= 0.6;
      ctx.beginPath();
      ctx.arc(px, py, r * 0.62, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      // tether to the ground so it is easy to judge the altitude
      const gh = Math.max(0, sim.mode === 'carrier' ? 0 : terrainHeight(g.x, sim.mode));
      ctx.save();
      ctx.globalAlpha = active ? 0.3 : 0.12;
      ctx.strokeStyle = col;
      ctx.setLineDash([5, 9]);
      ctx.beginPath();
      ctx.moveTo(px, py + r);
      ctx.lineTo(px, this.sy(gh));
      ctx.stroke();
      ctx.restore();
      // label
      const dx = g.x - sim.x;
      const km = Math.abs(dx) / 1000;
      ctx.font = '700 11px ui-monospace, Menlo, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillText(g.label, px + 1, py - r - 9);
      ctx.fillStyle = col;
      ctx.globalAlpha = active ? 1 : 0.6;
      ctx.fillText(g.label, px, py - r - 10);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(`${dx < 0 ? '<' : '>'} ${km < 10 ? km.toFixed(1) : Math.round(km)} km`, px, py - r + 20);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'start';
    }
  }

  // ---------------------------------------------------------------- wind & precipitation
  private drawWindStreaks(sim: Sim): void {
    const amt = clamp(this.mood.precip > 0.3 ? sim.wind.speed / 18 : sim.wind.speed / 12, 0, 1.3);
    if (amt < 0.18) return;
    const { ctx, W, H } = this;
    const n = Math.floor(50 * amt);
    const span = W + 400;
    const dir = Math.sign(sim.air?.wx || 1);
    ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      const y = hash(i * 2.13 + 7) * H;
      const len = 18 + hash(i * 5.9) * 80;
      const speed = 90 + amt * 260;
      let x = ((hash(i * 3.31) * span + sim.time * speed * dir) % span + span) % span;
      x -= 200;
      const a = (0.04 + 0.1 * hash(i * 1.71)) * amt;
      ctx.strokeStyle = `rgba(255,255,255,${a})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + len * dir, y);
      ctx.stroke();
    }
  }

  private drawPrecipitation(sim: Sim): void {
    const { ctx, W, H } = this;
    const rain = this.mood.rain;
    const snow = this.mood.snow;
    if (rain <= 0.02 && snow <= 0.02) return;
    const wxv = (sim.air?.wx ?? 0) * 1.4;
    const wrap = (v: number, m: number) => ((v % m) + m) % m;
    if (rain > 0.02) {
      const n = Math.floor(130 + 210 * rain);
      ctx.strokeStyle = 'rgba(196,220,244,0.75)';
      for (let i = 0; i < n; i++) {
        const d = this.rainDrops[i % this.rainDrops.length];
        const speed = 780 * d.s * (0.6 + rain);
        const y = wrap(d.y * H + sim.time * speed, H + 40) - 20;
        const x = wrap(d.x * W + sim.time * wxv * 9, W + 60) - 30;
        ctx.globalAlpha = clamp(0.2 + 0.5 * rain, 0, 0.7) * (0.5 + d.l * 0.5);
        ctx.lineWidth = 0.9 + d.l * 0.7;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - wxv * 1.4, y + 14 + d.l * 22);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (snow > 0.02) {
      const n = Math.floor(90 + 160 * snow);
      for (let i = 0; i < n; i++) {
        const f = this.flakes[i % this.flakes.length];
        const y = wrap(f.y * H + sim.time * 60 * f.s, H + 30) - 15;
        const x = wrap(f.x * W + sim.time * (26 + wxv * 6) + Math.sin(sim.time * 1.4 + f.p) * 22, W + 40) - 20;
        ctx.globalAlpha = clamp(0.35 + 0.5 * snow, 0, 0.85);
        ctx.fillStyle = '#f4f8ff';
        ctx.beginPath();
        ctx.arc(x, y, f.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }

  private drawFog(sim: Sim): void {
    const { ctx, W, H } = this;
    const hazeA = clamp(1 - this.mood.vis / 11000, 0, 0.9);
    const inside = this.mood.cloud;
    const a = clamp(hazeA * 0.5 + inside * 0.8, 0, 0.94);
    if (a < 0.02) return;
    const col = this.tod.night ? '16,20,30' : this.mood.storm ? '88,94,106' : '198,206,216';
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `rgba(${col},${a * 0.3})`);
    g.addColorStop(0.55, `rgba(${col},${a})`);
    g.addColorStop(1, `rgba(${col},${a})`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    void sim;
  }

  private drawLightning(sim: Sim): void {
    const { ctx, W, H } = this;
    const wx = sim.weather;
    if (wx.flash > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(208,224,255,${clamp(wx.flash * 0.45, 0, 0.5)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    const st = wx.strike;
    if (!st || sim.time - st.t > 0.2) return;
    const age = clamp((sim.time - st.t) / 0.2, 0, 1);
    const a = 1 - age;
    const px = this.sx(st.x);
    const top = this.sy(st.y);
    const ground = this.sy(Math.max(0, sim.mode === 'carrier' ? 0 : terrainHeight(st.x, sim.mode)));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(236,242,255,${a})`;
    ctx.shadowColor = '#cfe0ff';
    ctx.shadowBlur = 26;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    let x = px;
    let y = top;
    ctx.moveTo(x, y);
    const steps = 8;
    for (let i = 1; i <= steps; i++) {
      x = px + (hash(i * 3.7 + st.t * 1.3) - 0.5) * 110 * (1 - (i / steps) * 0.35);
      y = top + ((ground - top) * i) / steps;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- aircraft
  private drawPlane(sim: Sim): void {
    const { ctx, cam } = this;
    const z = cam.zoom;
    const s = sim.spec;
    const px = this.sx(sim.x);
    const py = this.sy(sim.y);
    // shadow
    {
      const gh = sim.groundH;
      const height = sim.y - gh;
      if (height < 220 && sim.surfaceAt(sim.x).kind !== 'water') {
        const a = clamp(1 - height / 220, 0, 1) * 0.35 * (this.tod.night ? 0.3 : 1);
        ctx.fillStyle = `rgba(0,0,0,${a})`;
        ctx.beginPath();
        const wsh = s.length * 0.55 * z * (1 + height * 0.002);
        ctx.ellipse(px, this.sy(gh) + 1, wsh, Math.max(1.5, 0.25 * z), 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const c = sim.cEff();
    const sgn = c >= 0 ? 1 : -1;
    const sxScale = sgn * Math.max(Math.abs(c), 0.16);
    // landing light: a soft cone thrown ahead of the nose at night
    if (this.tod.night && sim.alive && sim.gear > 0.5 && c > 0) {
      const reach = clamp(46 * z, 60, 520);
      const cyy = py - 8;
      const grd = ctx.createLinearGradient(px, cyy, px + reach, cyy + reach * Math.tan(sim.p) + 30);
      grd.addColorStop(0, 'rgba(255,246,214,0.28)');
      grd.addColorStop(1, 'rgba(255,246,214,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(px + 6, cyy);
      ctx.lineTo(px + reach, cyy + reach * Math.tan(sim.p) - reach * 0.16 + 30);
      ctx.lineTo(px + reach, cyy + reach * Math.tan(sim.p) + reach * 0.16 + 30);
      ctx.closePath();
      ctx.fill();
    }
    ctx.save();
    ctx.translate(px, py);
    ctx.scale(sxScale, 1);
    ctx.rotate(-sim.p);
    if (sim.turning && sim.turnKind === 'air') ctx.rotate(0);
    ctx.scale(z, -z);
    const dark = sim.alive ? 1 : 0.35;
    drawAircraft(ctx, s, {
      gear: s.fixedGear ? 1 : sim.gear,
      flaps: sim.flapPos,
      hook: sim.hookPos,
      thrust: sim.alive ? sim.thrust : 0,
      phase: sim.propPhase,
      time: sim.time,
      night: this.tod.night,
      light: this.light.map((v) => v * dark),
      crashed: !sim.alive,
    });
    ctx.restore();
  }

  // ---------------------------------------------------------------- particles
  private drawParticles(sim: Sim, front: boolean): void {
    const z = this.cam.zoom;
    for (const p of sim.particles) {
      const isFront = p.kind === 'fire' || p.kind === 'spark' || p.kind === 'debris';
      if (isFront !== front) continue;
      this.drawParticle(p, z);
    }
  }

  private drawParticle(p: Particle, z: number): void {
    const { ctx } = this;
    const px = this.sx(p.x);
    const py = this.sy(p.y);
    if (px < -80 || px > this.W + 80 || py < -80 || py > this.H + 80) return;
    const k = p.life / p.max;
    const r = Math.max(0.6, p.size * z);
    switch (p.kind) {
      case 'smoke':
        ctx.fillStyle = this.lit(p.col, 0.5 * k * Math.min(1, (1 - k) * 8 + 0.2));
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'fire':
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = this.raw(p.col, 0.75 * k);
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      case 'spark':
        ctx.strokeStyle = this.raw(p.col, k);
        ctx.lineWidth = Math.max(1, p.size * z * 0.7);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - p.vx * 0.04 * z, py + p.vy * 0.04 * z);
        ctx.stroke();
        break;
      case 'dust':
        ctx.fillStyle = this.lit(p.col, 0.35 * k);
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'trail':
        ctx.fillStyle = this.lit(p.col, 0.3 * Math.min(1, k * 2.2));
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'splash':
        ctx.fillStyle = this.lit(p.col, 0.7 * k);
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'debris':
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(p.rot);
        ctx.fillStyle = this.lit(p.col, Math.min(1, k * 3));
        ctx.fillRect(-r, -r * 0.4, r * 2, r * 0.8);
        ctx.restore();
        break;
    }
  }
}
