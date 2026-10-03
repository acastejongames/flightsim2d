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

function poly(ctx: CanvasRenderingContext2D, pts: number[][]): void {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

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

function strut(ctx: CanvasRenderingContext2D, x0: number, y0: number, len: number, e: number, r: number, col: Col, w = 0.14): void {
  if (e < 0.03) return;
  const y1 = y0 - len * e;
  ctx.strokeStyle = col(150, 152, 158);
  ctx.lineWidth = w;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0, y1);
  ctx.stroke();
  wheel(ctx, x0, y1, r, col);
}

function propDisc(ctx: CanvasRenderingContext2D, x: number, R: number, P: Pose, col: Col): void {
  if (P.thrust > 0.12) {
    ctx.fillStyle = col(210, 214, 220, 0.2);
    ctx.beginPath();
    ctx.ellipse(x, 0, 0.16, R, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = col(30, 30, 34, 0.35);
    ctx.lineWidth = 0.1;
    for (let i = 0; i < 2; i++) {
      const a = P.phase * (i ? 1.7 : 1.1);
      const h = R * Math.cos(a);
      ctx.beginPath();
      ctx.moveTo(x, -h);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = col(24, 24, 28);
    ctx.lineWidth = 0.17;
    for (let i = 0; i < 3; i++) {
      const a = P.phase * 0.08 + (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, R * Math.cos(a));
      ctx.stroke();
    }
  }
}

function glow(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, c: string): void {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, c);
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function navLights(ctx: CanvasRenderingContext2D, P: Pose, tailX: number, tailY: number, noseX: number): void {
  if (!P.night || P.crashed) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, noseX * 0.1, -0.3, 1.1, 'rgba(255,40,40,0.8)');
  glow(ctx, noseX * 0.1 - 0.5, -0.3, 1.1, 'rgba(60,255,90,0.5)');
  if ((P.time % 1.3) < 0.12) glow(ctx, tailX, tailY, 3, 'rgba(255,255,255,0.95)');
  ctx.restore();
}

// ---------------------------------------------------------------- Hornet
function hornet(ctx: CanvasRenderingContext2D, s: AircraftSpec, P: Pose, col: Col): void {
  // afterburner flame
  if (P.thrust > 0.12 && !P.crashed) {
    const ab = Math.max(0, P.thrust - 0.85) / 0.15;
    const fl = 0.85 + 0.15 * Math.sin(P.time * 90) + 0.1 * Math.sin(P.time * 53);
    const len = (0.8 + P.thrust * 1.6 + ab * 6.5) * fl;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createLinearGradient(-8.7, 0, -8.7 - len, 0);
    g.addColorStop(0, ab > 0.05 ? col(255, 235, 200, 0.95) : col(120, 170, 255, 0.7));
    g.addColorStop(0.35, ab > 0.05 ? col(255, 150, 40, 0.8) : col(90, 120, 255, 0.35));
    g.addColorStop(1, col(255, 80, 20, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(-8.7, 0.38);
    ctx.quadraticCurveTo(-8.7 - len * 0.6, 0.45, -8.7 - len, 0);
    ctx.quadraticCurveTo(-8.7 - len * 0.6, -0.45, -8.7, -0.32);
    ctx.fill();
    glow(ctx, -9, 0, 2.2 + ab * 3, `rgba(255,150,60,${0.25 + ab * 0.35})`);
    ctx.restore();
  }

  // landing gear (behind fuselage)
  const len = s.gearH - 0.85 - 0.42;
  strut(ctx, s.mainX, -0.85, len, P.gear, 0.42, col, 0.18);
  strut(ctx, s.noseX, -0.85, len, P.gear, 0.34, col, 0.14);
  // hook
  if (P.hook > 0.03) {
    ctx.strokeStyle = col(60, 60, 64);
    ctx.lineWidth = 0.12;
    const ex = -6.6 + (-s.hookX + 6.6) * P.hook;
    const ey = -0.5 + (-s.gearH + 0.1 + 0.5) * P.hook;
    ctx.beginPath();
    ctx.moveTo(-6.6, -0.5);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }

  // far tail fin
  ctx.fillStyle = col(96, 102, 112);
  poly(ctx, [[-4.2, 1.1], [-6.9, 3.7], [-7.9, 3.7], [-7.3, 1.1]]);
  ctx.fill();
  // far wing
  ctx.fillStyle = col(90, 96, 106);
  poly(ctx, [[2.8, -0.1], [0.4, 0.55], [-2.3, 0.55], [-3.0, -0.1]]);
  ctx.fill();

  // fuselage
  const fg = ctx.createLinearGradient(0, 1.3, 0, -1.1);
  fg.addColorStop(0, col(170, 178, 190));
  fg.addColorStop(0.5, col(128, 136, 148));
  fg.addColorStop(1, col(84, 90, 102));
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(8.7, -0.12);
  ctx.bezierCurveTo(7.6, 0.28, 6.4, 0.58, 5.3, 0.78);
  ctx.lineTo(3.8, 1.0);
  ctx.quadraticCurveTo(0.2, 1.35, -3, 1.15);
  ctx.lineTo(-8.0, 1.05);
  ctx.lineTo(-8.8, 0.55);
  ctx.lineTo(-8.8, -0.38);
  ctx.lineTo(-6.2, -0.8);
  ctx.quadraticCurveTo(-1.5, -1.05, 3.2, -1.1);
  ctx.quadraticCurveTo(6.0, -0.9, 7.2, -0.45);
  ctx.quadraticCurveTo(8.2, -0.3, 8.7, -0.12);
  ctx.closePath();
  ctx.fill();
  // nose radome
  ctx.fillStyle = col(60, 64, 72);
  poly(ctx, [[8.7, -0.12], [7.6, 0.28], [6.4, 0.58], [6.2, -0.45], [7.3, -0.4]]);
  ctx.fill();
  // intake
  ctx.fillStyle = col(30, 32, 38);
  poly(ctx, [[3.8, -0.2], [3.2, -1.1], [5.3, -0.85], [5.1, -0.3]]);
  ctx.fill();
  // accent stripes
  ctx.fillStyle = col(232, 130, 40);
  poly(ctx, [[-1.6, 1.3], [-3.2, 1.17], [-3.0, 0.9], [-1.4, 1.0]]);
  ctx.fill();
  ctx.fillStyle = col(240, 240, 245);
  ctx.beginPath();
  ctx.arc(0.9, 0.35, 0.42, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = col(30, 50, 110);
  ctx.beginPath();
  ctx.arc(0.9, 0.35, 0.3, 0, Math.PI * 2);
  ctx.fill();
  // panel lines
  ctx.strokeStyle = col(60, 66, 76, 0.5);
  ctx.lineWidth = 0.05;
  ctx.beginPath();
  ctx.moveTo(-5, 1.1);
  ctx.lineTo(-5, -0.7);
  ctx.moveTo(-1.5, 1.25);
  ctx.lineTo(-1.5, -1.0);
  ctx.moveTo(1.8, 1.3);
  ctx.lineTo(1.8, -1.05);
  ctx.stroke();
  // engine nozzles
  ctx.fillStyle = col(50, 46, 44);
  poly(ctx, [[-8.0, 0.6], [-8.9, 0.5], [-8.9, -0.4], [-7.8, -0.5]]);
  ctx.fill();

  // canopy
  const cg = ctx.createLinearGradient(0, 1.5, 0, 0.8);
  cg.addColorStop(0, col(150, 205, 235));
  cg.addColorStop(1, col(34, 70, 112));
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.moveTo(5.3, 0.78);
  ctx.bezierCurveTo(4.6, 1.2, 4.0, 1.6, 3.0, 1.62);
  ctx.bezierCurveTo(1.9, 1.62, 1.2, 1.35, 0.7, 1.2);
  ctx.lineTo(1.0, 0.95);
  ctx.lineTo(3.8, 0.98);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = col(20, 24, 30, 0.7);
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.moveTo(2.9, 1.62);
  ctx.lineTo(2.8, 0.98);
  ctx.stroke();
  ctx.fillStyle = col(255, 255, 255, 0.35);
  poly(ctx, [[4.4, 1.05], [3.6, 1.45], [3.1, 1.45], [3.7, 1.05]]);
  ctx.fill();

  // near tail fin
  const tg = ctx.createLinearGradient(0, 1, 0, 3.8);
  tg.addColorStop(0, col(130, 138, 150));
  tg.addColorStop(1, col(170, 176, 188));
  ctx.fillStyle = tg;
  poly(ctx, [[-4.6, 1.1], [-7.5, 4.0], [-8.7, 4.0], [-8.1, 1.05]]);
  ctx.fill();
  ctx.fillStyle = col(232, 130, 40);
  poly(ctx, [[-7.2, 3.7], [-8.5, 3.7], [-8.6, 4.0], [-7.5, 4.0]]);
  ctx.fill();
  // stabilizer
  ctx.fillStyle = col(104, 110, 122);
  poly(ctx, [[-6.0, 0.15], [-9.3, -0.05], [-9.4, -0.38], [-6.0, -0.2]]);
  ctx.fill();

  // near wing with flaps
  ctx.fillStyle = col(116, 124, 136);
  poly(ctx, [[3.2, -0.2], [0.2, -0.95], [-2.0, -0.95], [-2.9, -0.2]]);
  ctx.fill();
  ctx.save();
  ctx.translate(-2.0, -0.95);
  ctx.rotate(-P.flaps * 0.2);
  ctx.fillStyle = col(86, 92, 104);
  poly(ctx, [[0, 0], [-1.0, 0], [-0.7, 0.75], [0.2, 0.75]]);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = col(232, 130, 40);
  ctx.beginPath();
  ctx.arc(-0.5, -0.8, 0.14, 0, Math.PI * 2);
  ctx.fill();

  navLights(ctx, P, -8.2, 4.0, 4);
}

// ---------------------------------------------------------------- Corsair
function corsair(ctx: CanvasRenderingContext2D, s: AircraftSpec, P: Pose, col: Col): void {
  const len = s.gearH - 0.7 - 0.4;
  // tail wheel
  ctx.strokeStyle = col(150, 152, 158);
  ctx.lineWidth = 0.12;
  ctx.beginPath();
  ctx.moveTo(-4.3, -0.15);
  ctx.lineTo(-4.4, -s.gearH + 0.25 + (1 - P.gear) * 1.2);
  ctx.stroke();
  wheel(ctx, -4.4, -s.gearH + 0.25 + (1 - P.gear) * 1.2, 0.22, col);
  strut(ctx, s.mainX, -0.7, len, P.gear, 0.4, col, 0.16);
  if (P.hook > 0.03) {
    ctx.strokeStyle = col(60, 60, 64);
    ctx.lineWidth = 0.1;
    const ex = -4.0 + (-s.hookX + 4.0) * P.hook;
    const ey = -0.3 + (-s.gearH + 0.1 + 0.3) * P.hook;
    ctx.beginPath();
    ctx.moveTo(-4.0, -0.3);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }

  // far wing
  ctx.fillStyle = col(26, 52, 110);
  poly(ctx, [[2.0, -0.4], [0.3, 0.1], [-1.9, 0.15], [-1.5, -0.4]]);
  ctx.fill();

  // fuselage
  const fg = ctx.createLinearGradient(0, 1.2, 0, -0.9);
  fg.addColorStop(0, col(48, 86, 160));
  fg.addColorStop(0.55, col(26, 54, 116));
  fg.addColorStop(1, col(168, 176, 190));
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(4.5, 0.7);
  ctx.quadraticCurveTo(3.4, 0.98, 2.0, 1.08);
  ctx.lineTo(1.2, 1.12);
  ctx.quadraticCurveTo(-1.5, 1.05, -2.8, 0.85);
  ctx.lineTo(-5.0, 0.38);
  ctx.lineTo(-5.15, 0.0);
  ctx.lineTo(-4.9, -0.12);
  ctx.quadraticCurveTo(-2.5, -0.6, 0.8, -0.82);
  ctx.lineTo(3.4, -0.88);
  ctx.lineTo(4.5, -0.8);
  ctx.closePath();
  ctx.fill();
  // cowling
  const cg = ctx.createLinearGradient(0, 0.85, 0, -0.9);
  cg.addColorStop(0, col(110, 116, 126));
  cg.addColorStop(1, col(40, 42, 48));
  ctx.fillStyle = cg;
  ctx.beginPath();
  ctx.moveTo(3.4, 0.98);
  ctx.lineTo(4.85, 0.85);
  ctx.quadraticCurveTo(5.0, 0, 4.85, -0.95);
  ctx.lineTo(3.4, -0.9);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = col(20, 20, 24, 0.7);
  ctx.lineWidth = 0.05;
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(3.7 + i * 0.28, 0.9);
    ctx.lineTo(3.7 + i * 0.28, -0.85);
    ctx.stroke();
  }
  // spinner
  ctx.fillStyle = col(190, 40, 36);
  ctx.beginPath();
  ctx.moveTo(4.85, 0.35);
  ctx.quadraticCurveTo(5.5, 0.25, 5.6, 0);
  ctx.quadraticCurveTo(5.5, -0.25, 4.85, -0.35);
  ctx.closePath();
  ctx.fill();
  // exhaust stubs
  ctx.fillStyle = col(70, 50, 40);
  poly(ctx, [[3.1, -0.4], [2.5, -0.55], [2.5, -0.35], [3.1, -0.2]]);
  ctx.fill();
  // stripe + roundel
  ctx.fillStyle = col(236, 236, 240);
  poly(ctx, [[-2.4, 0.78], [-3.4, 0.68], [-3.4, 0.4], [-2.4, 0.5]]);
  ctx.fill();
  ctx.fillStyle = col(236, 236, 240);
  ctx.beginPath();
  ctx.arc(-1.1, 0.25, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = col(24, 44, 100);
  ctx.beginPath();
  ctx.arc(-1.1, 0.25, 0.37, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = col(236, 236, 240);
  ctx.beginPath();
  ctx.arc(-1.1, 0.25, 0.14, 0, Math.PI * 2);
  ctx.fill();

  // canopy
  const gg = ctx.createLinearGradient(0, 1.8, 0, 1.0);
  gg.addColorStop(0, col(170, 215, 240));
  gg.addColorStop(1, col(40, 80, 120));
  ctx.fillStyle = gg;
  ctx.beginPath();
  ctx.moveTo(1.9, 1.08);
  ctx.quadraticCurveTo(1.3, 1.85, 0.3, 1.82);
  ctx.quadraticCurveTo(-0.9, 1.8, -1.5, 1.0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = col(20, 28, 40, 0.7);
  ctx.lineWidth = 0.06;
  ctx.beginPath();
  ctx.moveTo(0.4, 1.82);
  ctx.lineTo(0.5, 1.05);
  ctx.stroke();

  // fin
  ctx.fillStyle = col(30, 60, 124);
  poly(ctx, [[-3.3, 0.8], [-4.8, 2.7], [-5.5, 2.7], [-5.2, 0.4]]);
  ctx.fill();
  ctx.fillStyle = col(20, 44, 96);
  poly(ctx, [[-4.6, 2.5], [-5.5, 2.7], [-5.2, 0.4], [-4.8, 0.55]]);
  ctx.fill();
  // stabilizer
  ctx.fillStyle = col(22, 46, 100);
  poly(ctx, [[-3.8, 0.4], [-5.6, 0.32], [-5.6, 0.12], [-3.8, 0.2]]);
  ctx.fill();

  // near wing (gull)
  const wg = ctx.createLinearGradient(0, 0, 0, -1.5);
  wg.addColorStop(0, col(36, 70, 140));
  wg.addColorStop(1, col(22, 46, 100));
  ctx.fillStyle = wg;
  poly(ctx, [[2.3, -0.45], [0.2, -1.3], [-1.9, -1.3], [-2.3, -0.4]]);
  ctx.fill();
  ctx.save();
  ctx.translate(-1.9, -1.3);
  ctx.rotate(-P.flaps * 0.22);
  ctx.fillStyle = col(18, 38, 84);
  poly(ctx, [[0, 0], [-0.8, 0], [-0.5, 0.7], [0.2, 0.7]]);
  ctx.fill();
  ctx.restore();

  propDisc(ctx, 5.3, s.propR, P, col);
  navLights(ctx, P, -5.0, 2.7, 3);
}

// ---------------------------------------------------------------- Sparrow
function sparrow(ctx: CanvasRenderingContext2D, s: AircraftSpec, P: Pose, col: Col): void {
  // fixed gear
  ctx.strokeStyle = col(70, 72, 78);
  ctx.lineWidth = 0.13;
  ctx.beginPath();
  ctx.moveTo(s.mainX, -0.5);
  ctx.lineTo(s.mainX + 0.1, -s.gearH + 0.3);
  ctx.moveTo(s.noseX, -0.4);
  ctx.lineTo(s.noseX, -s.gearH + 0.25);
  ctx.stroke();
  wheel(ctx, s.mainX + 0.1, -s.gearH + 0.3, 0.3, col);
  wheel(ctx, s.noseX, -s.gearH + 0.25, 0.25, col);
  ctx.fillStyle = col(230, 232, 236);
  ctx.beginPath();
  ctx.ellipse(s.mainX + 0.15, -s.gearH + 0.4, 0.55, 0.38, 0, 0, Math.PI * 2);
  ctx.fill();
  wheel(ctx, s.mainX + 0.1, -s.gearH + 0.3, 0.26, col);

  // fuselage
  const fg = ctx.createLinearGradient(0, 1.1, 0, -0.7);
  fg.addColorStop(0, col(250, 250, 252));
  fg.addColorStop(0.6, col(226, 230, 236));
  fg.addColorStop(1, col(160, 168, 180));
  ctx.fillStyle = fg;
  ctx.beginPath();
  ctx.moveTo(4.0, -0.05);
  ctx.quadraticCurveTo(3.9, 0.4, 3.3, 0.55);
  ctx.lineTo(2.6, 0.75);
  ctx.lineTo(1.9, 1.05);
  ctx.quadraticCurveTo(0.2, 1.15, -1.0, 1.0);
  ctx.lineTo(-4.2, 0.55);
  ctx.lineTo(-4.2, 0.3);
  ctx.lineTo(-2.5, -0.15);
  ctx.quadraticCurveTo(0, -0.7, 2.5, -0.65);
  ctx.lineTo(3.9, -0.45);
  ctx.closePath();
  ctx.fill();
  // cheatline
  ctx.fillStyle = col(200, 36, 44);
  poly(ctx, [[3.7, 0.12], [-4.1, 0.38], [-4.1, 0.27], [3.8, -0.06]]);
  ctx.fill();
  ctx.fillStyle = col(40, 60, 120);
  poly(ctx, [[3.5, 0.05], [-3.9, 0.3], [-3.9, 0.25], [3.55, 0.0]]);
  ctx.fill();
  // cowl intake
  ctx.fillStyle = col(30, 32, 36);
  ctx.beginPath();
  ctx.ellipse(3.85, -0.12, 0.12, 0.25, 0, 0, Math.PI * 2);
  ctx.fill();
  // windows
  const wg = ctx.createLinearGradient(0, 1.1, 0, 0.5);
  wg.addColorStop(0, col(170, 212, 238));
  wg.addColorStop(1, col(46, 82, 124));
  ctx.fillStyle = wg;
  poly(ctx, [[2.5, 0.78], [1.85, 1.02], [0.9, 1.08], [0.9, 0.62], [2.3, 0.62]]);
  ctx.fill();
  poly(ctx, [[0.7, 1.08], [-0.7, 1.0], [-0.7, 0.62], [0.7, 0.62]]);
  ctx.fill();
  poly(ctx, [[-0.9, 0.98], [-1.8, 0.84], [-1.8, 0.62], [-0.9, 0.62]]);
  ctx.fill();

  // struts
  ctx.strokeStyle = col(200, 204, 210);
  ctx.lineWidth = 0.09;
  ctx.beginPath();
  ctx.moveTo(0.3, 0.0);
  ctx.lineTo(0.9, 1.35);
  ctx.moveTo(1.0, 0.0);
  ctx.lineTo(1.4, 1.35);
  ctx.stroke();

  // high wing
  ctx.fillStyle = col(240, 242, 246);
  poly(ctx, [[2.1, 1.22], [2.35, 1.5], [-1.1, 1.55], [-1.1, 1.22]]);
  ctx.fill();
  ctx.fillStyle = col(200, 36, 44);
  poly(ctx, [[2.1, 1.22], [-1.1, 1.22], [-1.1, 1.3], [2.15, 1.3]]);
  ctx.fill();
  ctx.save();
  ctx.translate(-1.1, 1.22);
  ctx.rotate(-P.flaps * 0.22);
  ctx.fillStyle = col(214, 218, 226);
  poly(ctx, [[0, 0], [-0.75, 0], [-0.7, 0.32], [0.05, 0.32]]);
  ctx.fill();
  ctx.restore();

  // tail
  ctx.fillStyle = col(236, 238, 242);
  poly(ctx, [[-3.0, 0.6], [-3.95, 2.0], [-4.35, 2.0], [-4.2, 0.5]]);
  ctx.fill();
  ctx.fillStyle = col(200, 36, 44);
  poly(ctx, [[-3.8, 1.75], [-4.3, 1.75], [-4.35, 2.0], [-3.95, 2.0]]);
  ctx.fill();
  ctx.fillStyle = col(214, 218, 226);
  poly(ctx, [[-3.3, 0.5], [-4.5, 0.6], [-4.5, 0.4], [-3.3, 0.38]]);
  ctx.fill();

  propDisc(ctx, 4.05, s.propR, P, col);
  ctx.fillStyle = col(30, 32, 36);
  ctx.beginPath();
  ctx.ellipse(4.05, -0.05, 0.12, 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  navLights(ctx, P, -4.2, 2.0, 2);
}

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

/** Gear leg: swings down out of the bay as `g` goes 0 → 1. */
function gearLeg(
  ctx: CanvasRenderingContext2D,
  g: { x: number; pivotY: number; legLen: number; wheelR: number },
  gExt: number,
  col: Col,
  door: boolean,
): void {
  const ang = -1.5 * (1 - gExt); // stowed = folded back into the fuselage
  const ex = g.x + Math.sin(ang) * g.legLen;
  const ey = g.pivotY - Math.cos(ang) * g.legLen;
  ctx.strokeStyle = col(198, 202, 208);
  ctx.lineWidth = 0.17;
  ctx.beginPath();
  ctx.moveTo(g.x, g.pivotY);
  ctx.lineTo(ex, ey);
  // drag brace
  ctx.moveTo(g.x + (ex - g.x) * 0.45, g.pivotY + (ey - g.pivotY) * 0.45);
  ctx.lineTo(g.x + Math.sign(g.x - ex || 1) * 0.55, g.pivotY - 0.42);
  ctx.stroke();
  if (door) {
    ctx.strokeStyle = col(150, 155, 162);
    ctx.lineWidth = 0.1;
    ctx.beginPath();
    ctx.moveTo(g.x - 0.22, g.pivotY);
    ctx.lineTo(g.x + 0.5, g.pivotY);
    ctx.stroke();
  }
  wheel(ctx, ex, ey, g.wheelR, col);
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

  // afterburner / jet pipe
  const t = P.thrust;
  if (t > 0.05) {
    const n = sp.nozzle;
    const flick = 0.75 + 0.25 * Math.sin(P.time * 47);
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

  // retractable gear
  if (!s.fixedGear && P.gear > 0.02) {
    gearLeg(ctx, sp.nose, P.gear, col, P.gear < 0.95);
    gearLeg(ctx, sp.main, P.gear, col, false);
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
  if (s.id === 'hornet') hornet(ctx, s, P, col);
  else if (s.id === 'corsair') corsair(ctx, s, P, col);
  else sparrow(ctx, s, P, col);
}
