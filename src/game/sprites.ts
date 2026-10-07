import type { AircraftSpec, SpriteDef } from './aircraft';

export interface Pose {
  gear: number;
  flaps: number;
  hook: number;
  thrust: number;
  phase: number;
  time: number;
  night: boolean;
  light: number[];
  crashed: boolean;
  /** oleo deflection per leg (m, +compressed) — the legs flex, wheels planted */
  suspNose: number;
  suspMain: number;
}

type Col = (r: number, g: number, b: number, a?: number) => string;

function wheel(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, col: Col): void {
  ctx.fillStyle = col(24, 24, 28);
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = col(170, 172, 178);
  ctx.beginPath();
  ctx.arc(x, y, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
}

// ---------------------------------------------------------------- Hornet
// ---------------------------------------------------------------- sprite art
/**
 * Hand-drawn side views are loaded once and cached. Everything is drawn in the
 * same metre-based frame as the procedural aircraft, so the camera, the
 * retractable gear, particles and the physics all line up.
 */
const spriteCache = new Map<string, { img: HTMLImageElement; ok: boolean }>();

function spriteImage(src: string): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null; // headless (tests): fall back
  let rec = spriteCache.get(src);
  if (!rec) {
    const img = new Image();
    rec = { img, ok: false };
    img.onload = () => {
      rec!.ok = true;
    };
    img.src = src;
    spriteCache.set(src, rec);
  }
  return rec.ok ? rec.img : null;
}

/**
 * Landing gear: one dedicated sprite (images/scenery/gear.png) hung from the
 * airframe's pivot. It swings aft into the bay as the gear retracts, and the
 * artwork is drawn hanging straight down, so rotating about the pivot is all
 * that is needed.
 */
function gearLeg(
  ctx: CanvasRenderingContext2D,
  g: { x: number; pivotY: number; legLen: number; wheelR: number },
  gExt: number,
  col: Col,
  comp = 0,
): void {
  const ang = -1.45 * (1 - gExt); // stowed = folded back into the fuselage
  const legLen = Math.max(0.2, g.legLen - comp); // oleo flex, +compressed
  const length = legLen + g.wheelR;
  const spr = gearSprite();
  ctx.save();
  ctx.translate(g.x, g.pivotY);
  ctx.rotate(ang);
  if (spr) {
    const w = length * spr.aspect;
    // the world frame has +y up, so flip the bitmap or the wheel ends up on top
    ctx.save();
    ctx.scale(1, -1);
    ctx.drawImage(spr.img, -w / 2, 0, w, length);
    ctx.restore();
  } else {
    // fallback while the image loads: strut + wheel, same footprint
    ctx.strokeStyle = col(198, 202, 208);
    ctx.lineWidth = 0.17;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -legLen);
    ctx.stroke();
    wheel(ctx, 0, -legLen, g.wheelR, col);
  }
  ctx.restore();
}

const GEAR_SRC = 'images/scenery/gear.png';
let gearRec: { img: HTMLImageElement; aspect: number; ready: boolean } | null = null;

function gearSprite(): { img: HTMLImageElement; aspect: number } | null {
  if (typeof Image === 'undefined') return null;
  if (!gearRec) {
    const img = new Image();
    const rec = { img, aspect: 0.45, ready: false };
    img.onload = () => {
      rec.ready = true;
      rec.aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
    };
    img.src = GEAR_SRC;
    gearRec = rec;
  }
  return gearRec.ready ? gearRec : null;
}

let wreckCv: HTMLCanvasElement | null = null;

/**
 * Darkened copy of a sprite for the wreck state. The tint goes through the
 * artwork's own alpha channel (source-atop), so it hugs the airframe instead
 * of painting the whole bitmap rectangle. One shared scratch canvas, resized
 * to whatever sprite is asked — a single small blit per frame.
 */
function wreckSprite(img: HTMLImageElement, tint: string): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  if (!nw || !nh) return null;
  if (!wreckCv) wreckCv = document.createElement('canvas');
  if (wreckCv.width !== nw || wreckCv.height !== nh) {
    wreckCv.width = nw;
    wreckCv.height = nh;
  }
  const g = wreckCv.getContext('2d');
  if (!g) return null;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, nw, nh);
  g.drawImage(img, 0, 0);
  g.globalCompositeOperation = 'source-atop';
  g.fillStyle = tint;
  g.fillRect(0, 0, nw, nh);
  return wreckCv;
}

/**
 * Afterburner plume: a layered mach-diamond flame in the metre frame, drawn
 * additive ('lighter') so it glows. Mil power is a short blue-orange tongue;
 * full blower stretches a bright diamond-studded core several nozzle
 * diameters behind the jet, with a soft sheath and a wash of heat on the
 * tailcone — the look from the flight-line photos.
 */
function burnPlume(ctx: CanvasRenderingContext2D, n: { x: number; y: number; r: number }, t: number, P: Pose): void {
  const time = P.time;
  const ab = Math.min(1, Math.max(0, (t - 0.85) / 0.15)); // 0 mil .. 1 full blower
  const on = Math.min(1, Math.max(0, (t - 0.05) / 0.1)); // fade in, no pop
  const pw = 0.15 + 0.85 * Math.min(1, Math.max(0, (t - 0.15) / 0.7)); // idle whisper .. full body
  if (on <= 0) return;
  const boost = P.night ? 1.3 : 1;
  const r = n.r;
  const seed = n.x * 3.1 + n.y * 5.7;
  const fl = (f: number, a: number, ph: number): number => 1 - a + a * (0.5 + 0.5 * Math.sin(time * f + seed + ph));
  const A = (a: number): number => Math.min(1, a * on * boost);

  const len = r * (1.6 + 1.4 * Math.min(1, t / 0.85) + (5.5 + 2 * fl(23, 0.3, 0)) * ab);
  const sway = Math.sin(time * 17 + seed * 2) * r * 0.12 * (0.3 + 0.7 * ab);

  // envelope: wide lips at the nozzle, tapered licking tip
  const envelope = (l: number, w0: number, wMid: number, tipY: number): void => {
    const wob = Math.sin(time * 31 + seed) * r * 0.07;
    ctx.beginPath();
    ctx.moveTo(n.x, n.y + w0);
    ctx.quadraticCurveTo(n.x - l * 0.45, n.y + wMid + wob, n.x - l, tipY);
    ctx.quadraticCurveTo(n.x - l * 0.45, n.y - wMid + wob, n.x, n.y - w0);
    ctx.closePath();
  };

  // wash of heat on the tailcone around the nozzle
  if (ab > 0.02) {
    const g = ctx.createRadialGradient(n.x - r, n.y, 0, n.x - r, n.y, r * 4);
    g.addColorStop(0, `rgba(255,150,60,${A(0.2 * ab)})`);
    g.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(n.x - r, n.y, r * 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // outer sheath
  {
    const g = ctx.createLinearGradient(n.x, 0, n.x - len * 1.25, 0);
    g.addColorStop(0, `rgba(255,150,70,${A(0.3 * (0.35 + 0.65 * ab) * pw)})`);
    g.addColorStop(0.55, `rgba(255,100,35,${A(0.12 * pw)})`);
    g.addColorStop(1, 'rgba(255,80,20,0)');
    ctx.fillStyle = g;
    envelope(len * 1.25, r * 0.95, r * 0.75, n.y + sway * 1.4);
    ctx.fill();
  }

  // main body
  {
    const g = ctx.createLinearGradient(n.x, 0, n.x - len, 0);
    g.addColorStop(0, `rgba(255,214,140,${A((0.34 + 0.22 * ab) * pw)})`);
    g.addColorStop(0.5, `rgba(255,130,45,${A((0.26 + 0.12 * ab) * pw)})`);
    g.addColorStop(1, 'rgba(255,100,30,0)');
    ctx.fillStyle = g;
    envelope(len, r * 0.88, r * 0.62, n.y + sway);
    ctx.fill();
  }

  // core: blue tongue in mil, white-hot in blower
  if (ab > 0.02) {
    const cl = len * 0.55;
    const g = ctx.createLinearGradient(n.x, 0, n.x - cl, 0);
    g.addColorStop(0, `rgba(255,236,205,${A(0.42)})`);
    g.addColorStop(0.6, `rgba(255,196,120,${A(0.25)})`);
    g.addColorStop(1, 'rgba(255,160,80,0)');
    ctx.fillStyle = g;
    envelope(cl, r * 0.42, r * 0.28, n.y + sway * 0.6);
    ctx.fill();
  } else {
    const ml = r * (1.4 + 0.8 * fl(27, 0.4, 1));
    const g = ctx.createLinearGradient(n.x, 0, n.x - ml, 0);
    g.addColorStop(0, `rgba(170,195,255,${A(0.5 * pw)})`);
    g.addColorStop(1, 'rgba(120,140,255,0)');
    ctx.fillStyle = g;
    envelope(ml, r * 0.42, r * 0.3, n.y);
    ctx.fill();
  }

  // mach diamonds: pointed lens flares strung along the core, each flickering
  if (ab > 0.02) {
    const dia = (cx: number, rx: number, ry: number, a: number): void => {
      if (a <= 0.02 || rx <= 0.01) return;
      ctx.fillStyle = `rgba(255,155,60,${A(a * 0.7)})`;
      ctx.beginPath();
      ctx.moveTo(cx - rx * 1.3, n.y);
      ctx.quadraticCurveTo(cx, n.y - ry * 1.5, cx + rx * 1.3, n.y);
      ctx.quadraticCurveTo(cx, n.y + ry * 1.5, cx - rx * 1.3, n.y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = `rgba(255,252,240,${A(a)})`;
      ctx.beginPath();
      ctx.moveTo(cx - rx, n.y);
      ctx.quadraticCurveTo(cx, n.y - ry, cx + rx, n.y);
      ctx.quadraticCurveTo(cx, n.y + ry, cx - rx, n.y);
      ctx.closePath();
      ctx.fill();
    };
    for (let i = 0; i < 6; i++) {
      const cx = n.x - r * (1.05 + i * 1.35);
      if (n.x - cx > len * 0.8) break;
      const shrink = 1 - 0.13 * i;
      dia(
        cx,
        r * 0.52 * shrink * fl(19, 0.2, i),
        r * 0.33 * shrink,
        (1 - i * 0.12) * ab * fl(33 + i * 6, 0.4, i * 2.4),
      );
    }
  }

  // nozzle mouth: the petals glow white-hot in blower
  {
    const mr = r * (0.9 + 0.25 * ab);
    const g = ctx.createRadialGradient(n.x + r * 0.25, n.y, 0, n.x + r * 0.25, n.y, mr);
    g.addColorStop(0, `rgba(255,252,242,${A(0.15 + 0.75 * ab)})`);
    g.addColorStop(0.55, `rgba(255,190,110,${A(0.2 + 0.5 * ab)})`);
    g.addColorStop(1, 'rgba(255,140,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(n.x + r * 0.25, n.y, mr, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Aircraft drawn from a hand-drawn sprite, with live retractable gear. */
function spriteAircraft(ctx: CanvasRenderingContext2D, s: AircraftSpec, P: Pose, col: Col, img: HTMLImageElement): void {
  const sp = s.sprite!;
  const w = sp.xmax - sp.xmin;
  const h = sp.ymax - sp.ymin;
  // Crashed: paint the wreck through the artwork's own alpha channel instead of
  // a dark rectangle, so transparent pixels stay transparent and the tint hugs
  // the airframe. Falls back to the plain sprite if the tint cannot be built.
  const body = P.crashed ? (wreckSprite(img, col(30, 30, 34, 0.45)) ?? img) : img;
  ctx.save();
  // the drawing frame has +y up, so flip the bitmap back to upright
  ctx.globalAlpha = P.crashed ? 0.6 : 1;
  ctx.translate(sp.xmin, sp.ymax);
  ctx.scale(1, -1);
  ctx.drawImage(body, 0, 0, w, h);
  ctx.restore();
  ctx.globalAlpha = 1;

  // engines: afterburner plumes only — the propeller is part of the artwork
  const t = P.thrust;
  if (s.kind === 'jet' && t > 0.05) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const n of sp.engines) burnPlume(ctx, n, t, P);
    ctx.restore();
  }
  if (s.kind === 'heli' && t > 0.04) {
    const hub = sp.lights?.beacon ?? { x: 0, y: 2.35 };
    const rx = (s.propR ?? 6.9) * 0.92;
    ctx.save();
    ctx.globalAlpha = 0.18 + t * 0.14;
    ctx.fillStyle = '#6a6e74';
    // main rotor disc (top view blurred into side silhouette): thin ellipse
    ctx.beginPath();
    ctx.ellipse(hub.x, hub.y + 0.35, rx, 0.22 + t*0.08, 0, 0, Math.PI*2);
    ctx.fill();
    // rotor wash hint under the disc
    ctx.globalAlpha = 0.08 + t*0.06;
    ctx.fillStyle = '#aab4c0';
    ctx.beginPath();
    ctx.ellipse(hub.x - 0.2, hub.y - 0.6, rx*0.55, 0.45, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
    // tail rotor disc blur
    const tail = sp.lights?.tail ?? { x: -8.6, y: 2.2 };
    ctx.save();
    ctx.globalAlpha = 0.22 + t*0.18;
    ctx.fillStyle = '#5a5e66';
    ctx.beginPath();
    ctx.ellipse(tail.x, tail.y, 0.62, 0.62, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  // retractable gear
  if (!s.fixedGear && P.gear > 0.02) {
    gearLeg(ctx, sp.nose, P.gear, col, P.suspNose);
    gearLeg(ctx, sp.main, P.gear, col, P.suspMain);
  }

  lights(ctx, sp, P);
}

/**
 * External lights, in the metre frame of the artwork:
 *
 *   nav    steady, left wingtip red (the wing you see in a side view)
 *   tail   steady white on the tail cone
 *   strobe white double-flash, wingtip and tail
 *   beacon red double-pulse on the spine — the only one lit in daylight too
 *   rwy    landing/taxi light at the nose gear, bright at night
 */
function lights(ctx: CanvasRenderingContext2D, sp: SpriteDef, P: Pose): void {
  const L = sp.lights;
  if (!L) return;
  const t = P.time;
  const night = P.night;
  const pulse = (period: number, a: number, b: number) => {
    const p = t % period;
    return p < a || (p >= b && p < b + a);
  };
  const strobeOn = pulse(1.15, 0.045, 0.16);
  const beaconOn = pulse(1.4, 0.08, 0.26);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const bulb = (x: number, y: number, r: number, rgb: string, a: number, glow: number) => {
    if (a <= 0.01) return;
    ctx.globalAlpha = a;
    if (glow > 0) {
      const g = ctx.createRadialGradient(x, y, 0, x, y, glow);
      g.addColorStop(0, `rgba(${rgb},${0.5 * a})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, glow, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = `rgba(${rgb},${a})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  };

  // navigation: red wingtip (port) and white tail, steady — faint by day
  const navA = night ? 1 : 0.35;
  bulb(L.nav.x, L.nav.y, 0.1, '255,58,48', navA, night ? 0.45 : 0.1);
  bulb(L.tail.x, L.tail.y, 0.09, '255,255,255', navA * 0.95, night ? 0.4 : 0.16);
  // strobes: white, sharp double flash, day and night
  if (strobeOn) {
    bulb(L.nav.x, L.nav.y, 0.15, '255,255,255', 0.95, night ? 0.9 : 0.35);
    bulb(L.tail.x, L.tail.y, 0.13, '255,255,255', 0.9, night ? 0.8 : 0.3);
  }
  // anti-collision beacon on the spine
  if (beaconOn) bulb(L.beacon.x, L.beacon.y, 0.13, '255,40,32', 0.95, night ? 0.7 : 0.3);
  else bulb(L.beacon.x, L.beacon.y, 0.09, '150,20,18', night ? 0.5 : 0.3, 0);
  // runway / landing light at the nose: taxi glow by day, landing light at night
  bulb(L.rwy.x, L.rwy.y, 0.12, '255,246,214', night ? 1 : 0.3, night ? 1.5 : 0.2);
  ctx.restore();
}

export function drawAircraft(ctx: CanvasRenderingContext2D, s: AircraftSpec, P: Pose): void {
  const L = P.light;
  const col: Col = (r, g, b, a = 1) => {
    const cr = Math.min(255, r * L[0]) | 0;
    const cg = Math.min(255, g * L[1]) | 0;
    const cb = Math.min(255, b * L[2]) | 0;
    return `rgba(${cr},${cg},${cb},${a})`;
  };
  if (s.sprite) {
    const img = spriteImage(s.sprite.src);
    if (img) {
      spriteAircraft(ctx, s, P, col, img);
      return;
    }
  }
  // artwork still loading: a simple silhouette so the aircraft never vanishes
  ctx.fillStyle = col(205, 210, 218);
  ctx.beginPath();
  ctx.moveTo(s.length * 0.5, 0);
  ctx.lineTo(s.length * 0.2, 0.55);
  ctx.lineTo(-s.length * 0.4, 0.75);
  ctx.lineTo(-s.length * 0.46, 2.0);
  ctx.lineTo(-s.length * 0.28, 0.65);
  ctx.lineTo(-s.length * 0.5, 0.2);
  ctx.lineTo(-s.length * 0.48, -0.25);
  ctx.lineTo(-s.length * 0.28, -0.55);
  ctx.lineTo(s.length * 0.42, -0.5);
  ctx.closePath();
  ctx.fill();
}
