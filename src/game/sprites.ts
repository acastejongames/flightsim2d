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
    // The world frame has +y up, so flip vertically (-y).
    // Mirror horizontally (-1) so the torque link / scissors face aft (+x is forward).
    ctx.save();
    ctx.scale(-1, -1);
    ctx.drawImage(spr.img, -w / 2, 0, w, length);
    ctx.restore();
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

const AFTERBURNER_SRC = 'images/afterburner.png';
let abRec: { img: HTMLImageElement; ready: boolean } | null = null;

function afterburnerSprite(): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null;
  if (!abRec) {
    const img = new Image();
    const rec = { img, ready: false };
    img.onload = () => {
      rec.ready = true;
    };
    img.src = AFTERBURNER_SRC;
    abRec = rec;
  }
  return abRec.ready ? abRec.img : null;
}

/**
 * Draw a glowing navigation/presence light with core + soft halo.
 */
function glowLight(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  coreColor: string,
  haloColor: string,
  intensity = 1.0,
): void {
  if (intensity <= 0.01) return;
  ctx.save();
  // Outer halo
  const haloR = r * (2.8 + intensity * 1.5);
  const grd = ctx.createRadialGradient(x, y, r * 0.3, x, y, haloR);
  grd.addColorStop(0, haloColor);
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.arc(x, y, haloR, 0, Math.PI * 2);
  ctx.fill();

  // Intense center bead
  ctx.fillStyle = coreColor;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Aircraft drawn from a hand-drawn sprite, with live retractable gear. */
function spriteAircraft(ctx: CanvasRenderingContext2D, s: AircraftSpec, P: Pose, col: Col, img: HTMLImageElement): void {
  const sp = s.sprite!;
  const w = sp.xmax - sp.xmin;
  const h = sp.ymax - sp.ymin;
  ctx.save();
  // Ensure bilinear antialiasing for downscaled/zoomed out aircraft
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
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

  // Afterburner: dedicated textured plume image aligned with afterburner/engine nozzles
  const t = P.thrust;
  const abImg = afterburnerSprite();
  const abAnchors = s.anchors?.afterburner ?? (s.kind === 'jet' ? sp.engines : []);
  if (s.kind === 'jet' && t > 0.05 && abAnchors.length > 0) {
    for (const n of abAnchors) {
      const flick = 0.88 + 0.12 * Math.sin(P.time * 48 + n.y * 7);
      const plumeLen = (0.6 + t * t * 3.6) * flick;
      const plumeH = n.r * (0.8 + t * 0.9) * flick;

      if (abImg) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1.0, 0.35 + t * 0.7);
        // The texture nozzle is at right (x=w-16, y=h/2) and points leftward (exhaust to the left / -x).
        // Anchoring plume right edge at nozzle (n.x, n.y):
        ctx.drawImage(abImg, n.x - plumeLen, n.y - plumeH * 0.5, plumeLen, plumeH);
        ctx.restore();
      } else {
        // High quality fallback gradient if texture is still loading
        const rr2 = n.r * (0.5 + t * 0.55);
        const grd = ctx.createRadialGradient(n.x - plumeLen * 0.4, n.y, 0.05, n.x - plumeLen * 0.4, n.y, rr2);
        grd.addColorStop(0, t > 0.8 ? 'rgba(255,255,240,0.95)' : 'rgba(255,214,170,0.75)');
        grd.addColorStop(0.45, t > 0.8 ? 'rgba(120,190,255,0.75)' : 'rgba(255,160,80,0.55)');
        grd.addColorStop(1, 'rgba(255,120,40,0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.moveTo(n.x, n.y + rr2 * 0.55);
        ctx.quadraticCurveTo(n.x - plumeLen * 0.6, n.y, n.x, n.y - rr2 * 0.55);
        ctx.quadraticCurveTo(n.x - plumeLen, n.y, n.x, n.y + rr2 * 0.55);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  // retractable gear
  if (!s.fixedGear && P.gear > 0.02) {
    gearLeg(ctx, sp.nose, P.gear, col);
    gearLeg(ctx, sp.main, P.gear, col);
  }

  // =========================================================================
  // REGULATION LIGHTS SYSTEM (NAV right=green / left=red, Beacon, Strobe, Tail)
  // =========================================================================
  const anc = s.anchors;
  if (anc) {
    // 1. Anti-collision red beacon (slow pulsing ~1.5 Hz flash)
    // Red presence light, active day and night
    const beaconPhase = (P.time * 1.5) % 1;
    const beaconOn = beaconPhase < 0.22;
    const b = anc.beacon;
    glowLight(
      ctx,
      b.x,
      b.y,
      b.r ?? 0.09,
      beaconOn ? 'rgba(255, 60, 50, 0.98)' : 'rgba(120, 20, 20, 0.5)',
      beaconOn ? 'rgba(255, 40, 30, 0.55)' : 'rgba(100, 10, 10, 0.15)',
      beaconOn ? 1.0 : 0.25,
    );

    // 2. High-intensity anti-collision strobes (sharp double-pop flash ~1.2 Hz)
    // Flashes bright white
    const strobeCycle = (P.time * 1.25) % 1;
    const strobeFlash = (strobeCycle > 0.0 && strobeCycle < 0.08) || (strobeCycle > 0.16 && strobeCycle < 0.24);
    if (strobeFlash && !P.crashed) {
      for (const st of anc.strobes) {
        glowLight(
          ctx,
          st.x,
          st.y,
          st.r ?? 0.09,
          'rgba(255, 255, 255, 1.0)',
          'rgba(220, 240, 255, 0.85)',
          1.2,
        );
      }
    }

    // 3. Regulation Navigation Lights:
    // Starboard (right wing) = GREEN
    // Port (left wing) = RED
    // In side profile, both are visible with the foreground wing prominently lit
    const navRight = anc.navRight;
    const navLeft = anc.navLeft;
    const nightFactor = P.night ? 1.0 : 0.75;
    // Green starboard
    glowLight(
      ctx,
      navRight.x,
      navRight.y,
      navRight.r ?? 0.08,
      'rgba(80, 255, 120, 0.98)',
      'rgba(40, 240, 100, 0.65)',
      nightFactor,
    );
    // Red port
    glowLight(
      ctx,
      navLeft.x,
      navLeft.y,
      navLeft.r ?? 0.08,
      'rgba(255, 65, 65, 0.98)',
      'rgba(240, 40, 40, 0.65)',
      nightFactor,
    );

    // 4. White tail position light (mandatory at night or low light)
    if (P.night && anc.tailLight) {
      glowLight(
        ctx,
        anc.tailLight.x,
        anc.tailLight.y,
        anc.tailLight.r ?? 0.07,
        'rgba(255, 255, 255, 0.95)',
        'rgba(230, 240, 255, 0.6)',
        1.0,
      );
    }
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
