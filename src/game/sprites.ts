import type { AircraftSpec } from './aircraft';

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
): void {
  const ang = -1.45 * (1 - gExt); // stowed = folded back into the fuselage
  const length = g.legLen + g.wheelR;
  const spr = gearSprite();
  ctx.save();
  ctx.translate(g.x, g.pivotY);
  ctx.rotate(ang);
  if (spr) {
    const w = length * spr.aspect;
    ctx.drawImage(spr.img, -w / 2, -length, w, length);
  } else {
    // fallback while the image loads: strut + wheel, same footprint
    ctx.strokeStyle = col(198, 202, 208);
    ctx.lineWidth = 0.17;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(0, -g.legLen);
    ctx.stroke();
    wheel(ctx, 0, -g.legLen, g.wheelR, col);
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

/** Aircraft drawn from a hand-drawn sprite, with live retractable gear. */
function spriteAircraft(ctx: CanvasRenderingContext2D, s: AircraftSpec, P: Pose, col: Col, img: HTMLImageElement): void {
  const sp = s.sprite!;
  const w = sp.xmax - sp.xmin;
  const h = sp.ymax - sp.ymin;
  ctx.save();
  // the drawing frame has +y up, so flip the bitmap back to upright
  ctx.globalAlpha = P.crashed ? 0.6 : 1;
  ctx.translate(sp.xmin, sp.ymax);
  ctx.scale(1, -1);
  ctx.drawImage(img, 0, 0, w, h);
  ctx.restore();
  ctx.globalAlpha = 1;
  if (P.crashed) {
    ctx.fillStyle = col(30, 30, 34, 0.45);
    ctx.fillRect(sp.xmin, sp.ymin, w, h);
  }

  // engines: afterburner plumes only — the propeller is part of the artwork
  const t = P.thrust;
  if (s.kind === 'jet' && t > 0.05) {
    for (const n of sp.engines) {
      const flick = 0.75 + 0.25 * Math.sin(P.time * 47 + n.y * 5);
      const len = (0.35 + t * t * 2.6) * flick;
      const rr2 = n.r * (0.5 + t * 0.55);
      const grd = ctx.createRadialGradient(n.x - len * 0.4, n.y, 0.05, n.x - len * 0.4, n.y, rr2);
      grd.addColorStop(0, t > 0.8 ? 'rgba(255,255,240,0.95)' : 'rgba(255,214,170,0.75)');
      grd.addColorStop(0.45, t > 0.8 ? 'rgba(120,190,255,0.75)' : 'rgba(255,160,80,0.55)');
      grd.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.moveTo(n.x, n.y + rr2 * 0.55);
      ctx.quadraticCurveTo(n.x - len * 0.6, n.y, n.x, n.y - rr2 * 0.55);
      ctx.quadraticCurveTo(n.x - len, n.y, n.x, n.y + rr2 * 0.55);
      ctx.closePath();
      ctx.fill();
    }
  }

  // retractable gear
  if (!s.fixedGear && P.gear > 0.02) {
    gearLeg(ctx, sp.nose, P.gear, col);
    gearLeg(ctx, sp.main, P.gear, col);
  }

  // anti-collision beacon + tail navigation light
  const blink = Math.sin(P.time * 6) > 0.2;
  ctx.fillStyle = blink ? col(255, 70, 60) : col(90, 30, 30);
  ctx.beginPath();
  ctx.arc(sp.xmax - 0.45, sp.ymax - 0.35, 0.09, 0, Math.PI * 2);
  ctx.fill();
  if (P.night) {
    ctx.fillStyle = col(255, 255, 255);
    ctx.beginPath();
    ctx.arc(sp.xmin + 0.12, sp.ymin + 0.3, 0.07, 0, Math.PI * 2);
    ctx.fill();
  }
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
