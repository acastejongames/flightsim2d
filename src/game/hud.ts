import { clamp } from './noise';
import type { Sim } from './sim';
import { getAirport, airportsNear } from './world';
import { t, t2, getLang } from './i18n';
import type { MissionRun } from './missions';

export interface HudExtra {
  paused: boolean;
  fps: number;
  muted: boolean;
  showHelp: boolean;
  /** time acceleration in force (1 = real time) */
  warp?: number;
}

/** radar echoes are recomputed a few times per second, not every frame */
let radarCache: { t: number; data: number[][] } = { t: -99, data: [] };
let missionBanner: { id: string; t: number } | null = null;

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
const SANS = 'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';

function rr(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function panel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  rr(ctx, x, y, w, h, 14);
  ctx.fillStyle = 'rgba(8,14,26,0.64)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.13)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, align: CanvasTextAlign = 'left'): void {
  ctx.font = `600 10px ${SANS}`;
  ctx.fillStyle = 'rgba(160,185,215,0.8)';
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
}

function value(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size = 28, color = '#f1f6ff', align: CanvasTextAlign = 'left'): void {
  ctx.font = `700 ${size}px ${MONO}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(text, x, y);
}

function chip(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, w: number, on: boolean, color: string): void {
  rr(ctx, x, y, w, 20, 6);
  ctx.fillStyle = on ? color : 'rgba(255,255,255,0.06)';
  ctx.fill();
  ctx.font = `700 10px ${SANS}`;
  ctx.fillStyle = on ? '#06101c' : 'rgba(190,205,225,0.55)';
  ctx.textAlign = 'center';
  ctx.fillText(text, x + w / 2, y + 14);
}

function attitude(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, sim: Sim): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  let pitch = sim.p;
  let roll = 0;
  if (sim.turning && sim.turnKind === 'air') roll = -1.0 * Math.sin(Math.PI * sim.turnT) * sim.hdg;
  if (Math.cos(pitch) < 0) {
    roll += Math.PI;
    pitch = Math.sign(pitch) * (Math.PI - Math.abs(pitch));
  }
  const k = r / 0.75;
  ctx.translate(cx, cy);
  ctx.rotate(roll);
  ctx.translate(0, pitch * k);
  const sky = ctx.createLinearGradient(0, -r * 3, 0, 0);
  sky.addColorStop(0, '#1e5fb0');
  sky.addColorStop(1, '#6fb4ee');
  ctx.fillStyle = sky;
  ctx.fillRect(-r * 3, -r * 4, r * 6, r * 4);
  const gr = ctx.createLinearGradient(0, 0, 0, r * 3);
  gr.addColorStop(0, '#8a6a42');
  gr.addColorStop(1, '#3e2c18');
  ctx.fillStyle = gr;
  ctx.fillRect(-r * 3, 0, r * 6, r * 4);
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-r * 2, 0);
  ctx.lineTo(r * 2, 0);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.font = `600 8px ${MONO}`;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.textAlign = 'center';
  for (let d = -40; d <= 40; d += 10) {
    if (d === 0) continue;
    const y = -(d * Math.PI) / 180 * k;
    const w = d % 20 === 0 ? 16 : 9;
    ctx.beginPath();
    ctx.moveTo(-w, y);
    ctx.lineTo(w, y);
    ctx.stroke();
    if (d % 20 === 0) {
      ctx.fillText(String(Math.abs(d)), -w - 8, y + 3);
      ctx.fillText(String(Math.abs(d)), w + 8, y + 3);
    }
  }
  ctx.restore();
  // velocity vector
  ctx.save();
  ctx.translate(cx, cy);
  const a = clamp(sim.aoa, -0.6, 0.6);
  const vy = a * k;
  ctx.strokeStyle = '#7dff9a';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.arc(0, vy, 4.5, 0, Math.PI * 2);
  ctx.moveTo(-11, vy);
  ctx.lineTo(-4.5, vy);
  ctx.moveTo(4.5, vy);
  ctx.lineTo(11, vy);
  ctx.moveTo(0, vy - 4.5);
  ctx.lineTo(0, vy - 9);
  ctx.stroke();
  // fixed aircraft symbol
  ctx.strokeStyle = '#ffd24a';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-r * 0.62, 0);
  ctx.lineTo(-r * 0.22, 0);
  ctx.lineTo(-r * 0.12, 7);
  ctx.moveTo(r * 0.62, 0);
  ctx.lineTo(r * 0.22, 0);
  ctx.lineTo(r * 0.12, 7);
  ctx.stroke();
  ctx.fillStyle = '#ffd24a';
  ctx.fillRect(-1.5, -1.5, 3, 3);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
}

function ols(ctx: CanvasRenderingContext2D, W: number, H: number, sim: Sim): void {
  const err = sim.olsError();
  if (err === null || !sim.alive) return;
  const x = W - 74;
  const y = H / 2 - 110;
  const h = 220;
  panel(ctx, x - 34, y - 26, 68, h + 52);
  label(ctx, 'MEATBALL', x, y - 10, 'center');
  const cy = y + h / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  rr(ctx, x - 5, y, 10, h, 5);
  ctx.fill();
  // datum lights
  for (const sx of [-24, -17, 17, 24]) {
    ctx.save();
    ctx.shadowColor = '#35e07a';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#35e07a';
    ctx.beginPath();
    ctx.arc(x + sx, cy, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const by = clamp(cy - (err / 1.3) * (h / 2 - 12), y + 8, y + h - 8);
  const low = err < -0.5;
  const color = Math.abs(err) > 1.0 ? '#ff4040' : low ? '#ff9f2e' : '#ffc233';
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, by, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const txt = err > 0.5 ? 'HIGH' : err < -0.5 ? 'LOW' : 'ON GLIDE';
  label(ctx, txt, x, y + h + 18, 'center');
  const tdX = (sim.carrier ? sim.carrier.x : 0) + 82;
  const rng = Math.max(0, (tdX - sim.x) / 1000);
  label(ctx, `${rng.toFixed(1)} km`, x, y + h + 32 - 2, 'center');
}

// ---------------------------------------------------------------- mission & weather panels
function missionPanel(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, run: MissionRun, sim: Sim): void {
  const m = run.mission;
  const lang = getLang();
  const h = 96;
  panel(ctx, x, y, w, h);
  ctx.textAlign = 'left';
  ctx.font = `800 12px ${SANS}`;
  ctx.fillStyle = '#ffd24a';
  ctx.fillText(lang === 'es' ? 'CONTRATO' : 'CONTRACT', x + 12, y + 19);
  ctx.font = `700 12px ${SANS}`;
  ctx.fillStyle = '#e8f1ff';
  const title = lang === 'es' ? m.titleEs : m.titleEn;
  ctx.fillText(title.length > 34 ? `${title.slice(0, 33)}…` : title, x + 84, y + 19);
  // status dot
  const dotCol = run.status === 'done' ? '#7dffa6' : run.status === 'failed' ? '#ff6b5e' : '#5fe0ff';
  ctx.fillStyle = dotCol;
  ctx.beginPath();
  ctx.arc(x + w - 14, y + 15, 4, 0, Math.PI * 2);
  ctx.fill();

  label(ctx, t('objective'), x + 12, y + 38);
  ctx.font = `600 11.5px ${SANS}`;
  ctx.fillStyle = '#cfe0ff';
  ctx.fillText(run.objective(lang), x + 12, y + 54);

  // gates progress
  const total = m.gates.length;
  if (total > 0) {
    const done = m.gates.filter((g) => g.passed).length;
    const bw = w - 24;
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    rr(ctx, x + 12, y + 62, bw, 6, 3);
    ctx.fill();
    ctx.fillStyle = '#5fe0ff';
    rr(ctx, x + 12, y + 62, Math.max(3, (bw * done) / total), 6, 3);
    ctx.fill();
    ctx.font = `600 10px ${MONO}`;
    ctx.fillStyle = 'rgba(190,210,235,0.85)';
    ctx.fillText(`${done}/${total}`, x + 12 + bw - 22, y + 82);
  }

  // timer / distance
  ctx.font = `700 11px ${MONO}`;
  const timeLeft = run.timeLeft;
  if (timeLeft !== null) {
    const mm = Math.floor(timeLeft / 60);
    const ss = Math.floor(timeLeft % 60);
    ctx.fillStyle = timeLeft < 45 ? '#ff6b5e' : timeLeft < 120 ? '#ffc65a' : '#7dffa6';
    ctx.fillText(`T-${mm}:${ss.toString().padStart(2, '0')}`, x + 12, y + 84);
  } else {
    const next = run.nextGate;
    if (next) {
      const km = Math.abs(next.x - sim.x) / 1000;
      ctx.fillStyle = 'rgba(190,210,235,0.9)';
      ctx.fillText(`${next.x < sim.x ? '◀' : '▶'} ${km < 10 ? km.toFixed(1) : Math.round(km)} km`, x + 12, y + 84);
    } else if (m.landingAirport !== null) {
      const ap = getAirport(m.landingAirport);
      const km = Math.abs(ap.x - sim.x) / 1000;
      ctx.fillStyle = '#ffd24a';
      ctx.fillText(`${ap.name} ${ap.x < sim.x ? '◀' : '▶'} ${km < 10 ? km.toFixed(1) : Math.round(km)} km`, x + 12, y + 84);
    }
  }
  ctx.textAlign = 'right';
  ctx.font = `700 11px ${MONO}`;
  ctx.fillStyle = '#ffd24a';
  ctx.fillText(`+${run.totalMoney()}`, x + w - 12, y + 84);
  ctx.textAlign = 'start';
}

function weatherPanel(ctx: CanvasRenderingContext2D, W: number, y0: number, sim: Sim): void {
  const w = 244;
  const x = W - w - 14;
  const h = 176;
  const y = y0;
  const wx = sim.weather;
  const lang = getLang();
  panel(ctx, x, y, w, h);
  label(ctx, t('weather'), x + 12, y + 18);
  ctx.font = `700 12px ${SANS}`;
  ctx.fillStyle = '#e8f1ff';
  ctx.textAlign = 'left';
  ctx.fillText(`${wx.preset.icon} ${lang === 'es' ? wx.preset.es : wx.preset.en}`, x + 12, y + 36);

  // wind
  const head = sim.wind.head * 1.944;
  const cross = sim.wind.cross * 1.944;
  label(ctx, 'WIND', x + 12, y + 56);
  ctx.font = `700 13px ${MONO}`;
  ctx.fillStyle = '#8fd0ff';
  ctx.fillText(`${Math.round(Math.abs(head))} kt`, x + 56, y + 57);
  ctx.font = `600 10px ${MONO}`;
  ctx.fillStyle = 'rgba(200,215,235,0.9)';
  ctx.fillText(`${head >= 0 ? 'HD' : 'TAIL'} · ${Math.abs(cross) > 1 ? `${cross > 0 ? 'X→' : 'X←'} ${Math.round(Math.abs(cross))}` : 'X 0'}`, x + 112, y + 57);
  // wind arrow
  const ax = x + w - 30;
  const ay = y + 30;
  const dir = Math.sign(sim.air?.wx || 1);
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(dir > 0 ? 0 : Math.PI);
  ctx.strokeStyle = '#8fd0ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-14, 0);
  ctx.lineTo(10, 0);
  ctx.moveTo(10, 0);
  ctx.lineTo(3, -5);
  ctx.moveTo(10, 0);
  ctx.lineTo(3, 5);
  ctx.stroke();
  ctx.restore();

  // visibility + turbulence
  ctx.font = `600 10px ${MONO}`;
  ctx.fillStyle = 'rgba(190,210,235,0.9)';
  const visKm = sim.weather.visibility(sim.x, sim.y, sim.air?.cloud ?? 0) / 1000;
  ctx.fillText(`VIS ${visKm < 10 ? visKm.toFixed(1) : Math.round(visKm)} km`, x + 12, y + 76);
  const tb = clamp(sim.wind.turb, 0, 1.35);
  ctx.fillStyle = tb > 0.66 ? '#ff6b5e' : tb > 0.35 ? '#ffc65a' : '#7dffa6';
  ctx.fillText(`TURB ${(tb * 100).toFixed(0)}%`, x + 100, y + 76);
  ctx.fillStyle = `rgba(200,215,235,0.9)`;
  ctx.fillText(`${Math.round(sim.weather.tempAt(sim.y))}°C`, x + 178, y + 76);
  if (sim.weather.wetness > 0.15) {
    ctx.fillStyle = '#8fd0ff';
    ctx.fillText(`WET ${Math.round(sim.weather.wetness * 100)}%`, x + 12, y + 90);
  }
  if (sim.weather.evolving && sim.weather.incoming) {
    const inc: string = getLang() === 'es' ? sim.weather.incoming.es : sim.weather.incoming.en;
    ctx.fillStyle = '#ffc65a';
    ctx.fillText(`${t2('FRONT IN', 'FRENTE')}: ${inc}`, x + 12, y + 90);
  }

  // ice + damage bars
  const bar = (oy: number, v: number, col: string, name: string) => {
    ctx.font = `600 9px ${SANS}`;
    ctx.fillStyle = 'rgba(190,210,235,0.85)';
    ctx.fillText(name, x + 12, y + oy + 8);
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    rr(ctx, x + 58, y + oy, 172, 7, 3);
    ctx.fill();
    ctx.fillStyle = col;
    rr(ctx, x + 58, y + oy, Math.max(2, 172 * clamp(v, 0, 1)), 7, 3);
    ctx.fill();
  };
  bar(98, sim.ice, sim.ice > 0.5 ? '#ff6b5e' : '#9fe8ff', t2('ICE', 'HIELO'));
  bar(114, sim.damage, sim.damage > 0.5 ? '#ff6b5e' : '#ffc65a', t2('DMG', 'DAÑO'));

  // weather radar (vertical profile ahead)
  const rx = x + 12;
  const ry = y + 130;
  const rw = w - 24;
  const rh = 36;
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  rr(ctx, rx, ry, rw, rh, 5);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,200,255,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
  if (sim.time - radarCache.t > 0.25) {
    radarCache.t = sim.time;
    const rangeKm = sim.spec.radarKm ?? 6;
    radarCache.data = sim.weather.radar(sim.x, sim.y, rangeKm * 1000, 4200, 46, 14);
  }
  const grid = radarCache.data;
  if (grid.length) {
    const cw = rw / 46;
    const chh = rh / 14;
    for (let r = 0; r < grid.length; r++) {
      for (let c = 0; c < grid[r].length; c++) {
        const v = grid[r][c];
        if (v < 0.12) continue;
        const gg = Math.min(1, v);
        const col = gg > 0.7 ? `rgba(255,80,70,${0.55 + gg * 0.35})` : gg > 0.42 ? `rgba(255,200,70,${0.5 + gg * 0.3})` : `rgba(90,220,140,${0.35 + gg * 0.3})`;
        ctx.fillStyle = col;
        ctx.fillRect(rx + c * cw, ry + r * chh, cw + 0.6, chh + 0.6);
      }
    }
  }
  // own-ship marker
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(rx + rw * 0.33 - 2, ry + rh / 2 - 2, 4, 4);
  ctx.font = `600 9px ${MONO}`;
  ctx.fillStyle = 'rgba(190,215,240,0.8)';
  ctx.fillText(`${(sim.spec.radarKm ?? 6).toFixed(0)} km`, rx + rw - 34, ry + rh - 3);
}

/**
 * Landing guidance: how far above or below the ideal glidepath you are, and how
 * far the threshold is. Drawn above the wind strip while you are on approach.
 */
function glidePanel(ctx: CanvasRenderingContext2D, W: number, H: number, sim: Sim): void {
  if (!sim.alive || sim.grounded) return;
  const g = sim.glidepath();
  if (!g) return;
  const lowWork = sim.gearCmd > 0.5 || sim.agl < 650;
  if (!lowWork) return;
  const pw = Math.min(W - 28 - 260, 600);
  const left = 14 + pw + 10;
  const right = W - 258 - 10;
  const avail = right - left;
  if (avail < 150) return;
  const w = Math.min(260, avail);
  const x = left + (avail - w) / 2;
  const h = 64;
  const y = H - 146 - h - 8;
  if (y < 60) return;
  panel(ctx, x, y, w, h);
  label(ctx, `${t('glideTitle')} · ${g.name.slice(0, 18).toUpperCase()}`, x + 12, y + 18);

  // deviation tape: +60 m (high) .. -60 m (low)
  const bx = x + 12;
  const by = y + 26;
  const bw = 26;
  const bh = 30;
  const cx = bx + bw / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  rr(ctx, bx, by, bw, bh, 5);
  ctx.fill();
  // on-path window
  ctx.fillStyle = 'rgba(125,255,166,0.18)';
  const half = bh / 2;
  ctx.fillRect(bx, by + half - 4, bw, 8);
  ctx.strokeStyle = 'rgba(125,255,166,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bx, by + half);
  ctx.lineTo(bx + bw, by + half);
  ctx.stroke();
  const dev = clamp(g.dev, -60, 60);
  const dy = by + half - (dev / 60) * (half - 4);
  const col = Math.abs(g.dev) < 14 ? '#7dffa6' : Math.abs(g.dev) < 40 ? '#ffc65a' : '#ff6b5e';
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(cx, dy - 6);
  ctx.lineTo(cx + 6, dy);
  ctx.lineTo(cx, dy + 6);
  ctx.lineTo(cx - 6, dy);
  ctx.closePath();
  ctx.fill();
  ctx.font = `600 9px ${MONO}`;
  ctx.fillStyle = 'rgba(200,215,235,0.75)';
  ctx.textAlign = 'left';
  ctx.fillText('+60', bx + bw + 3, by + 8);
  ctx.fillText('0', bx + bw + 3, by + half + 3);
  ctx.fillText('−60', bx + bw + 3, by + bh);

  const tx = bx + bw + 26;
  ctx.font = `800 13px ${SANS}`;
  ctx.fillStyle = col;
  const state = Math.abs(g.dev) < 14 ? t('glideOnPath') : g.dev > 0 ? t('glideHigh') : t('glideLow');
  ctx.fillText(state, tx, y + 40);
  ctx.font = `600 11px ${MONO}`;
  ctx.fillStyle = 'rgba(200,215,235,0.9)';
  const dist = g.dist < 1000 ? `${Math.round(g.dist / 10) * 10} m` : `${(g.dist / 1000).toFixed(1)} km`;
  ctx.fillText(`${t2('TO THR', 'A UMBRAL')} ${dist}  ·  ${g.dev >= 0 ? '+' : '−'}${Math.abs(Math.round(g.dev))} m`, tx, y + 56);

}

/** Wind + centreline strip under the aircraft, bottom centre. */
function windStrip(ctx: CanvasRenderingContext2D, W: number, H: number, sim: Sim): void {
  const pw = Math.min(W - 28 - 260, 600);
  const left = 14 + pw + 10;
  const right = W - 258 - 10;
  const avail = right - left;
  if (avail < 150) return;
  const w = Math.min(260, avail);
  const x = left + (avail - w) / 2;
  const y = H - 146;
  const h = 132;
  panel(ctx, x, y, w, h);
  label(ctx, t2('WIND & CENTRELINE', 'VIENTO Y EJE'), x + 12, y + 18);
  // centreline: aircraft offset from the runway axis
  const cx = x + 12;
  const cy = y + 30;
  const cw = w - 24;
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  rr(ctx, cx, cy, cw, 26, 6);
  ctx.fill();
  const halfW = 18;
  const pxm = (off: number) => cx + cw / 2 + (clamp(off, -halfW * 1.8, halfW * 1.8) / (halfW * 1.8)) * (cw / 2 - 6);
  // runway sides
  ctx.fillStyle = 'rgba(120,200,255,0.35)';
  ctx.fillRect(pxm(-halfW), cy + 3, 2, 20);
  ctx.fillRect(pxm(halfW), cy + 3, 2, 20);
  ctx.fillStyle = 'rgba(120,200,255,0.5)';
  ctx.fillRect(cx + cw / 2 - 1, cy + 3, 2, 20);
  const off = sim.offset;
  const bad = Math.abs(off) > halfW;
  ctx.fillStyle = bad ? '#ff6b5e' : Math.abs(off) > halfW * 0.6 ? '#ffc65a' : '#7dffa6';
  ctx.beginPath();
  ctx.moveTo(pxm(off), cy + 20);
  ctx.lineTo(pxm(off) - 5, cy + 26);
  ctx.lineTo(pxm(off) + 5, cy + 26);
  ctx.closePath();
  ctx.fill();
  ctx.font = `600 10px ${MONO}`;
  ctx.fillStyle = 'rgba(200,215,235,0.9)';
  ctx.fillText(`${off >= 0 ? '+' : ''}${off.toFixed(1)} m`, cx, cy + 40);
  ctx.fillStyle = Math.abs(sim.crab) > 12 ? '#ffc65a' : 'rgba(200,215,235,0.9)';
  ctx.fillText(`${t2('CRAB', 'DERIVA')} ${sim.crab.toFixed(0)}°`, cx + 70, cy + 40);
  // rudder bar
  const rx = cx + cw - 60;
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  rr(ctx, rx, cy + 30, 60, 8, 4);
  ctx.fill();
  ctx.fillStyle = '#b69cff';
  rr(ctx, rx + 30 - 2 + (sim.rudder * 26), cy + 30, 4, 8, 2);
  ctx.fill();
  label(ctx, t2('RUDDER J/L', 'TIMÓN J/L'), rx + 30, cy + 50, 'center');
  // wind vector
  const hy2 = y + 96;
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.beginPath();
  ctx.moveTo(cx + 4, hy2);
  ctx.lineTo(cx + 60, hy2);
  ctx.stroke();
  const head = sim.wind.head;
  const cross = sim.wind.cross;
  const scale = 5;
  ctx.save();
  ctx.translate(cx + 30, hy2);
  ctx.strokeStyle = '#8fd0ff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-head * scale, -cross * scale * 0.6);
  ctx.stroke();
  ctx.fillStyle = '#8fd0ff';
  ctx.beginPath();
  ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.font = `600 9px ${SANS}`;
  ctx.fillStyle = 'rgba(190,210,235,0.85)';
  ctx.fillText(`${Math.round(Math.hypot(head, cross) * 1.944)} kt`, cx + 66, hy2 + 3);
  void H;
}

function hazardChips(ctx: CanvasRenderingContext2D, W: number, sim: Sim, y: number, warp = 1): void {
  const items: { txt: string; col: string }[] = [];
  if (sim.ice > 0.05) items.push({ txt: `${t2('ICE', 'HIELO')} ${Math.round(sim.ice * 100)}%`, col: '#9fe8ff' });
  if (sim.damage > 0.05) items.push({ txt: `${t2('DMG', 'DAÑO')} ${Math.round(sim.damage * 100)}%`, col: '#ffc65a' });
  if (sim.combo > 1) items.push({ txt: `${t2('COMBO', 'COMBO')} ×${sim.combo}`, col: '#7dffa6' });
  if (sim.weather.wetness > 0.4) items.push({ txt: t2('WET RUNWAY', 'PISTA MOJADA'), col: '#8fd0ff' });
  if (sim.mission && sim.mission.status === 'done') items.push({ txt: t2('CONTRACT DONE', 'CONTRATO OK'), col: '#7dffa6' });
  if (sim.mission && sim.mission.status === 'failed') items.push({ txt: t2('CONTRACT FAILED', 'CONTRATO FALLIDO'), col: '#ff6b5e' });
  if (sim.sandbox?.on) items.push({ txt: t2('SANDBOX · U', 'SANDBOX · U'), col: '#7ef0c0' });
  if (sim.altHold !== null) items.push({ txt: `AP ALT · O`, col: '#7dffa6' });
  if (sim.smokeOn) items.push({ txt: t2('SMOKE ON', 'HUMO ON'), col: '#ff9ad5' });
  if (warp > 1) items.push({ txt: `TIME ×${warp}`, col: '#ffd24a' });
  if (!items.length) return;
  let x = W / 2;
  const totalW = items.reduce((a, i) => a + i.txt.length * 6.4 + 18, 0);
  x -= totalW / 2;
  for (const it of items) {
    const w = it.txt.length * 6.4 + 16;
    rr(ctx, x, y, w, 19, 9);
    ctx.fillStyle = 'rgba(8,14,26,0.7)';
    ctx.fill();
    ctx.strokeStyle = it.col;
    ctx.globalAlpha = 0.55;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.font = `700 10px ${SANS}`;
    ctx.fillStyle = it.col;
    ctx.textAlign = 'center';
    ctx.fillText(it.txt, x + w / 2, y + 13);
    x += w + 6;
  }
  ctx.textAlign = 'start';
}

function missionBannerDraw(ctx: CanvasRenderingContext2D, W: number, H: number, sim: Sim): void {
  const run = sim.mission;
  if (!run) return;
  const id = run.mission.id;
  if (!missionBanner || missionBanner.id !== id) missionBanner = { id, t: sim.time };
  const age = sim.time - missionBanner.t;
  if (age > 8 || !sim.alive || sim.grounded === false) return;
  const a = age < 0.6 ? age / 0.6 : clamp((8 - age) / 1.4, 0, 1);
  if (a <= 0.01) return;
  const m = run.mission;
  const lang = getLang();
  const w = Math.min(560, W - 60);
  const x = (W - w) / 2;
  const y = H * 0.16;
  ctx.save();
  ctx.globalAlpha = a;
  panel(ctx, x, y, w, 108);
  ctx.textAlign = 'center';
  ctx.font = `800 11px ${SANS}`;
  ctx.fillStyle = '#ffd24a';
  ctx.fillText(lang === 'es' ? 'INFORME DE MISIÓN' : 'MISSION BRIEFING', W / 2, y + 22);
  ctx.font = `800 20px ${SANS}`;
  ctx.fillStyle = '#ffffff';
  ctx.fillText(lang === 'es' ? m.titleEs : m.titleEn, W / 2, y + 48);
  ctx.font = `500 12.5px ${SANS}`;
  ctx.fillStyle = 'rgba(225,235,250,0.9)';
  const brief = lang === 'es' ? m.briefEs : m.briefEn;
  const words = brief.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const wd of words) {
    if ((line + wd).length > 74) {
      lines.push(line.trim());
      line = '';
    }
    line += `${wd} `;
  }
  if (line.trim()) lines.push(line.trim());
  lines.slice(0, 2).forEach((l, i) => ctx.fillText(l, W / 2, y + 68 + i * 15));
  ctx.font = `700 11px ${MONO}`;
  ctx.fillStyle = '#ffd24a';
  const wxName = lang === 'es' ? sim.weather.preset.es : sim.weather.preset.en;
  ctx.fillText(
    `${sim.weather.preset.icon} ${wxName}  ·  ${t('reward')} ${m.money} cr / ${m.xp} XP  ·  ${t('difficulty')} ${'★'.repeat(m.difficulty)}`,
    W / 2,
    y + 100,
  );
  ctx.restore();
  ctx.textAlign = 'start';
}

export function drawHUD(ctx: CanvasRenderingContext2D, W: number, H: number, sim: Sim, extra: HudExtra): void {
  const s = sim.spec;
  const kt = sim.ias * 1.944;
  const ft = sim.y * 3.281;
  const aglFt = Math.max(0, sim.agl) * 3.281;
  const fpm = sim.vy * 196.85;

  // ---------------- messages
  let my = 70;
  for (const m of sim.msgs.slice(-3)) {
    const fade = clamp(Math.min(m.t / 0.2, (m.dur - m.t) / 0.6), 0, 1);
    const col = m.kind === 'good' ? '#7dffa6' : m.kind === 'warn' ? '#ffc65a' : m.kind === 'bad' ? '#ff6b5e' : '#e8f1ff';
    ctx.globalAlpha = fade;
    ctx.textAlign = 'center';
    ctx.font = `800 26px ${SANS}`;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillText(m.text, W / 2 + 1.5, my + 1.5);
    ctx.fillStyle = col;
    ctx.fillText(m.text, W / 2, my);
    if (m.sub) {
      ctx.font = `500 14px ${SANS}`;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillText(m.sub, W / 2 + 1, my + 22);
      ctx.fillStyle = 'rgba(235,242,255,0.92)';
      ctx.fillText(m.sub, W / 2, my + 21);
      my += 28;
    }
    my += 36;
    ctx.globalAlpha = 1;
  }

  // ---------------- mission briefing banner
  missionBannerDraw(ctx, W, H, sim);

  // ---------------- warnings
  const warns: string[] = [];
  if (sim.alive) {
    if (sim.pullUp) warns.push('PULL UP');
    if (sim.stallWarn) warns.push('STALL');
    if (sim.overspeed) warns.push('OVERSPEED');
    if (sim.engineOut) warns.push('ENGINE OUT');
    if (!s.fixedGear && !sim.grounded && sim.gearCmd < 0.5 && sim.agl < 120 && sim.ias < 1.5 * s.vs && sim.vy < 0) warns.push('GEAR');
    if (sim.g > 7) warns.push('G-LIMIT');
    if (sim.ice > 0.35) warns.push(t2('ICING', 'HIELO'));
    if (sim.damage > 0.6) warns.push(t2('DAMAGE', 'DAÑOS'));
    if (sim.air && sim.air.micro > 0.4 && !sim.grounded) warns.push(t2('SHEAR', 'CIZALLADURA'));
  }
  if (warns.length) {
    const flash = Math.floor(sim.time * 4) % 2 === 0;
    ctx.textAlign = 'center';
    ctx.font = `900 30px ${SANS}`;
    warns.forEach((w, i) => {
      ctx.fillStyle = flash ? '#ff3b30' : '#ffb3ad';
      ctx.fillText(w, W / 2, H * 0.3 + i * 36);
    });
  }

  // ---------------- top-left info
  panel(ctx, 14, 14, 250, 62);
  ctx.textAlign = 'left';
  ctx.font = `800 13px ${SANS}`;
  ctx.fillStyle = '#e8f1ff';
  ctx.fillText(`${s.name.toUpperCase()}`, 28, 36);
  ctx.font = `500 11px ${SANS}`;
  ctx.fillStyle = 'rgba(160,185,215,0.9)';
  ctx.fillText(`${sim.mode === 'carrier' ? 'CARRIER OPS' : 'OPEN WORLD'}  ·  Score ${sim.score}`, 28, 53);
  const mins = Math.floor(sim.flightTime / 60);
  const secs = Math.floor(sim.flightTime % 60);
  ctx.fillText(`${mins}:${secs.toString().padStart(2, '0')}  ·  ${(sim.distance / 1000).toFixed(1)} km  ·  ${sim.mode === 'carrier' ? `Traps ${sim.traps}` : `Landings ${sim.landings}`}`, 28, 68);

  // ---------------- nav panel (top right)
  {
    const rows: { name: string; dx: number; carrier: boolean }[] = [];
    if (sim.mode === 'open') {
      for (const ap of airportsNear(sim.x, 2)) rows.push({ name: ap.name, dx: ap.x - sim.x, carrier: false });
    } else if (sim.carrier) {
      rows.push({ name: 'USS Aurora (CV)', dx: sim.carrier.x + 150 - sim.x, carrier: true });
    }
    rows.sort((a, b) => Math.abs(a.dx) - Math.abs(b.dx));
    const list = rows.slice(0, 3);
    const w = 230;
    const x = W - w - 14;
    panel(ctx, x, 14, w, 34 + list.length * 22);
    label(ctx, sim.mode === 'carrier' ? 'CARRIER' : 'NEAREST AIRFIELDS', x + 14, 32);
    list.forEach((r, i) => {
      const y = 54 + i * 22;
      ctx.textAlign = 'left';
      ctx.font = `600 12px ${SANS}`;
      ctx.fillStyle = '#e8f1ff';
      ctx.fillText(r.name, x + 14, y);
      ctx.textAlign = 'right';
      ctx.font = `700 12px ${MONO}`;
      ctx.fillStyle = r.carrier ? '#ffd24a' : '#8fd0ff';
      const km = Math.abs(r.dx) / 1000;
      ctx.fillText(`${r.dx < 0 ? '◀' : '▶'} ${km < 10 ? km.toFixed(1) : Math.round(km)} km`, x + w - 14, y);
    });
  }

  // ---------------- mission panel
  if (sim.mission) missionPanel(ctx, 14, 86, 250, sim.mission, sim);

  // ---------------- weather panel
  weatherPanel(ctx, W, 14 + 34 + Math.min(3, sim.mode === 'carrier' ? 1 : 3) * 22 + 10, sim);

  // ---------------- landing guidance
  glidePanel(ctx, W, H, sim);

  // ---------------- hazard chips
  hazardChips(ctx, W, sim, H - 30, extra.warp ?? 1);

  // ---------------- flight instrument panel
  const pw = Math.min(W - 28 - 260, 600);
  const px = 14;
  const py = H - 146;
  if (pw > 360) {
    panel(ctx, px, py, pw, 132);
    attitude(ctx, px + 74, py + 66, 52, sim);
    const c1 = px + 148;
    label(ctx, 'AIRSPEED  KT', c1, py + 26);
    value(ctx, String(Math.round(kt)).padStart(3, ' '), c1, py + 58, 32, sim.stallWarn ? '#ff6b5e' : sim.overspeed ? '#ff6b5e' : '#f1f6ff');
    ctx.font = `600 11px ${MONO}`;
    ctx.fillStyle = 'rgba(160,185,215,0.9)';
    ctx.textAlign = 'left';
    ctx.fillText(`M ${sim.mach.toFixed(2)}`, c1, py + 78);
    ctx.fillText(`GS ${Math.round(Math.abs(sim.worldVx) * 1.944)} kt`, c1 + 62, py + 78);
    if (sim.autoThr) {
      ctx.fillStyle = '#7dffa6';
      ctx.fillText(`A/T SET ${Math.round(sim.atTarget * 1.944)}`, c1, py + 98);
    }
    // speed bar relative to stall
    const barW = 110;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    rr(ctx, c1, py + 108, barW, 6, 3);
    ctx.fill();
    const vsf = clamp(sim.ias / (s.vne * 1.1), 0, 1);
    ctx.fillStyle = '#4aa8ff';
    rr(ctx, c1, py + 108, Math.max(4, barW * vsf), 6, 3);
    ctx.fill();
    ctx.fillStyle = '#ff6b5e';
    ctx.fillRect(c1 + barW * clamp(s.vs / (s.vne * 1.1), 0, 1), py + 105, 2, 12);
    ctx.fillStyle = '#ffd24a';
    ctx.fillRect(c1 + barW * clamp(s.vApproach / (s.vne * 1.1), 0, 1), py + 105, 2, 12);

    const c2 = c1 + 150;
    label(ctx, 'ALTITUDE  FT', c2, py + 26);
    value(ctx, Math.round(ft).toLocaleString('en-US'), c2, py + 58, 30);
    ctx.font = `600 11px ${MONO}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = fpm < -1800 ? '#ff6b5e' : fpm < 0 ? '#ffc65a' : '#7dffa6';
    ctx.fillText(`V/S ${fpm >= 0 ? '+' : ''}${Math.round(fpm / 10) * 10} fpm`, c2, py + 78);
    ctx.fillStyle = 'rgba(160,185,215,0.9)';
    ctx.fillText(sim.grounded ? 'ON GROUND' : `AGL ${aglFt < 3000 ? Math.round(aglFt) : Math.round(aglFt / 10) * 10} ft`, c2, py + 98);
    ctx.fillText(`HDG ${sim.hdg > 0 ? 'EAST' : 'WEST'}${sim.turning ? ' (turning)' : ''}`, c2, py + 116);

    const c3 = c2 + 138;
    label(ctx, 'LOAD', c3, py + 26);
    const gc = sim.g > 6 ? '#ff6b5e' : sim.g > 4 ? '#ffc65a' : '#f1f6ff';
    value(ctx, `${sim.g.toFixed(1)}`, c3, py + 58, 28, gc);
    ctx.font = `700 11px ${SANS}`;
    ctx.fillStyle = 'rgba(160,185,215,0.9)';
    ctx.fillText('G', c3 + 54, py + 58);
    // AoA gauge
    label(ctx, 'AoA', c3, py + 82);
    const gx = c3;
    const gy = py + 90;
    const gw = 70;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    rr(ctx, gx, gy, gw, 8, 4);
    ctx.fill();
    const stallPos = 0.82;
    ctx.fillStyle = 'rgba(80,220,130,0.55)';
    ctx.fillRect(gx + gw * 0.38 * stallPos, gy, gw * 0.24 * stallPos, 8);
    ctx.fillStyle = 'rgba(255,200,60,0.45)';
    ctx.fillRect(gx + gw * 0.62 * stallPos, gy, gw * 0.2 * stallPos, 8);
    ctx.fillStyle = 'rgba(255,70,60,0.55)';
    ctx.fillRect(gx + gw * stallPos, gy, gw * (1 - stallPos), 8);
    const aPos = clamp((sim.aoa / s.alphaStall) * stallPos, 0, 1);
    ctx.fillStyle = '#fff';
    ctx.fillRect(gx + gw * aPos - 1.5, gy - 3, 3, 14);
    ctx.font = `600 10px ${MONO}`;
    ctx.fillStyle = 'rgba(160,185,215,0.9)';
    ctx.fillText(`${((sim.aoa * 180) / Math.PI).toFixed(1)}°`, gx, gy + 24);
  }

  // ---------------- engine panel
  {
    const w = 244;
    const x = W - w - 14;
    const y = H - 146;
    panel(ctx, x, y, w, 132);
    // throttle bar
    const bx = x + 18;
    const by = y + 16;
    const bh = 98;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    rr(ctx, bx, by, 20, bh, 6);
    ctx.fill();
    const tf = sim.throttle;
    const th = bh * tf;
    const g = ctx.createLinearGradient(0, by + bh, 0, by);
    g.addColorStop(0, '#2ec9ff');
    g.addColorStop(0.85, '#7dffa6');
    g.addColorStop(1, '#ff9a2e');
    ctx.fillStyle = g;
    rr(ctx, bx, by + bh - th, 20, Math.max(2, th), 6);
    ctx.fill();
    if (s.kind === 'jet') {
      ctx.strokeStyle = 'rgba(255,150,40,0.9)';
      ctx.setLineDash([3, 2]);
      ctx.beginPath();
      ctx.moveTo(bx - 3, by + bh * 0.15);
      ctx.lineTo(bx + 23, by + bh * 0.15);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.fillStyle = '#fff';
    ctx.fillRect(bx - 4, by + bh - bh * sim.thrust - 1, 28, 2);
    label(ctx, 'THR', bx + 10, y + 126, 'center');
    // fuel
    const fx = x + 52;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    rr(ctx, fx, by, 14, bh, 5);
    ctx.fill();
    const ff = sim.fuelFrac;
    ctx.fillStyle = ff < 0.15 ? '#ff5a4d' : ff < 0.3 ? '#ffc233' : '#5fd1ff';
    rr(ctx, fx, by + bh - bh * ff, 14, Math.max(2, bh * ff), 5);
    ctx.fill();
    label(ctx, 'FUEL', fx + 7, y + 126, 'center');
    // numbers
    const nx = x + 80;
    ctx.textAlign = 'left';
    ctx.font = `700 16px ${MONO}`;
    ctx.fillStyle = '#f1f6ff';
    const thrPct = Math.round(sim.throttle * 100);
    ctx.fillText(`${s.kind === 'jet' && sim.throttle > 0.85 ? 'AB ' : ''}${thrPct}%`, nx, y + 30);
    ctx.font = `600 11px ${MONO}`;
    ctx.fillStyle = 'rgba(160,185,215,0.9)';
    ctx.fillText(`${Math.round(sim.fuel)} kg`, nx, y + 46);
    // chips
    const cw = 74;
    const gearDown = sim.gear > 0.95;
    const gearMove = sim.gear > 0.05 && sim.gear < 0.95;
    chip(ctx, gearMove ? 'GEAR ···' : gearDown ? 'GEAR ▼' : 'GEAR ▲', nx, y + 56, cw, gearDown || gearMove, gearMove ? '#ffc233' : '#7dffa6');
    chip(ctx, `FLAPS ${['0', '½', 'F'][sim.flaps]}`, nx + cw + 6, y + 56, 76, sim.flaps > 0, '#8fd0ff');
    chip(ctx, 'HOOK', nx, y + 80, cw, sim.hook, '#ffd24a');
    chip(ctx, sim.parked || sim.input.brake || sim.airbrake > 0.5 ? 'BRAKE' : 'BRAKE', nx + cw + 6, y + 80, 76, sim.parked || sim.input.brake, '#ff7a6b');
    chip(ctx, 'ASSIST', nx, y + 104, cw, sim.assist, '#b69cff');
    chip(ctx, 'A/THR', nx + cw + 6, y + 104, 76, sim.autoThr, '#7dffa6');
  }

  // ---------------- wind & centreline strip
  windStrip(ctx, W, H, sim);

  // ---------------- landing aid
  if (sim.mode === 'carrier') ols(ctx, W, H, sim);

  // ---------------- footer hints
  ctx.textAlign = 'center';
  ctx.font = `500 11px ${SANS}`;
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  const hint =
    sim.mode === 'carrier'
      ? '↑↓ pitch · ←→ throttle · J/L rudder · SPACE catapult · G gear · F flaps · H hook · B brake · T turn · Y assist · K auto-thrust · R reset · ESC menu'
      : '↑↓ pitch · ←→ throttle · J/L rudder · G gear · F flaps · B brake · T turn · Y assist · K auto-thrust · R respawn · ESC menu';
  if (W > 900) ctx.fillText(hint, W / 2, H - 6);

  // ---------------- crash overlay
  if (!sim.alive) {
    ctx.fillStyle = 'rgba(30,0,0,0.35)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.font = `900 64px ${SANS}`;
    ctx.fillStyle = '#ff4a3d';
    ctx.fillText(t('crashed').toUpperCase(), W / 2, H / 2 - 20);
    ctx.font = `600 20px ${SANS}`;
    ctx.fillStyle = '#ffe3df';
    ctx.fillText(sim.crashReason, W / 2, H / 2 + 14);
    ctx.font = `500 15px ${SANS}`;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(t2('Press R to respawn · ESC for menu', 'Pulsa R para reaparecer · ESC para el menú'), W / 2, H / 2 + 46);
  }

  if (extra.paused) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, 0, W, H);
  }
}
