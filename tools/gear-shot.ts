/**
 * Gear-down close-ups: each aircraft parked at its own gear height over the
 * airfield, so the drawn legs/wheels can be compared with the ground line the
 * physics uses (y = terrain + gearH).
 *
 *   npx esbuild tools/gear-shot.ts --bundle --platform=node --format=esm \
 *     --outfile=node_modules/.cache/gear.mjs --external:@napi-rs/canvas && node node_modules/.cache/gear.mjs
 */
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { installDom, preloadPublic } from './render-shot';

interface Opt {
  ac: string;
  gear?: number;
  night?: boolean;
  /** zoom of the close-up */
  z?: number;
  label: string;
}

export async function gearShots(opts: Opt[], file = '/tmp/gear.png', cols = 2): Promise<void> {
  const n = await preloadPublic();
  console.log(`gear-shot: ${n} sprites decoded`);
  installDom();
  const { Renderer } = await import('../src/game/render');
  const { Sim } = await import('../src/game/sim');
  const { AIRCRAFT } = await import('../src/game/aircraft');
  const { getAirport, terrainHeight } = await import('../src/game/world');

  const W = 480;
  const H = 300;
  const rows = Math.ceil(opts.length / cols);
  const sheet = createCanvas(W * cols, H * rows);
  const sctx = sheet.getContext('2d');
  sctx.fillStyle = '#101822';
  sctx.fillRect(0, 0, sheet.width, sheet.height);

  for (let i = 0; i < opts.length; i++) {
    const o = opts[i];
    const cv: any = createCanvas(W, H);
    cv.style = {};
    const r: any = new Renderer(cv, o.night ? 'night' : 'day');
    r.resize(W, H, 1);
    const spec: any = AIRCRAFT.find((a: any) => a.id === o.ac);
    const sim: any = new Sim({
      mode: 'open',
      spec,
      tod: o.night ? 'night' : 'day',
      startAir: true,
      weather: 'clear',
      mission: null,
      sandbox: null,
    });
    await new Promise((res) => setTimeout(res, 60));
    const ap = getAirport(0);
    const IN = { pitch: 0, thr: 0, brake: false, rudder: 0 };
    // park it on the runway at the gear height the physics expects
    sim.x = ap.x - 60;
    sim.hdg = 1;
    sim.y = ap.elev + spec.gearH;
    sim.u = 0;
    sim.vy = 0;
    sim.p = 0;
    sim.grounded = true;
    sim.alive = true;
    sim.parked = true;
    const gear = o.gear ?? 1;
    for (let k = 0; k < 240; k++) {
      sim.update(1 / 60, IN);
      sim.y = ap.elev + spec.gearH;
      sim.u = 0;
      sim.grounded = true;
      sim.gearCmd = gear;
      sim.gear += (gear - sim.gear) * 0.5;
      sim.x = ap.x - 60;
      sim.vy = 0;
      sim.p = 0;
    }
    r.userZoom = 1;
    r.cam.x = sim.x;
    r.cam.y = terrainHeight(sim.x, 'open');
    r.cam.zoom = o.z ?? 3.2;
    r.initCam = true;
    sim.tas = 0;
    for (let k = 0; k < 30; k++) {
      sim.msgs.length = 0; // plain frame: no coaching text over the artwork
      r.frame(sim, 1 / 60, { fps: 60, warp: 1, compact: true, insetBottom: 0, insetTop: 0 });
    }
    const cx = (i % cols) * W;
    const cy = Math.floor(i / cols) * H;
    sctx.drawImage(cv, cx, cy);
    sctx.strokeStyle = 'rgba(120,200,255,0.35)';
    sctx.strokeRect(cx + 0.5, cy + 0.5, W - 1, H - 1);
    sctx.fillStyle = '#ffd24a';
    sctx.font = '700 13px monospace';
    sctx.fillText(o.label, cx + 10, cy + 20);
  }
  writeFileSync(file, sheet.toBuffer('image/png'));
  console.log('wrote', file);
}

if (process.argv[1]?.includes('gear.mjs')) {
  await gearShots(
    [
      { ac: 'cn235', label: 'CN-235 gear down (x12)', z: 12 },
      { ac: 'cn235', label: 'CN-235 gear down (x6)', z: 6 },
      { ac: 'pc21', label: 'PC-21 gear down (x12)', z: 12 },
      { ac: 'ef18', label: 'EF-18 gear down (x12)', z: 12 },
      { ac: 'typhoon', label: 'Typhoon gear down (x12)', z: 12 },
      { ac: 'cn235', label: 'CN-235 night (x8)', night: true, z: 8 },
      { ac: 'ef18', label: 'EF-18 night (x8)', night: true, z: 8 },
    ],
    '/tmp/gear2.png',
    2,
  );
}
