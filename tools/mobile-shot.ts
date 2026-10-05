/**
 * Headless phone-size frame renderer — used to check the compact (touch) HUD
 * without a browser. Reuses the DOM stub from `render-shot.ts`.
 *
 *   npx esbuild tools/mobile-shot.ts --bundle --platform=node --format=esm \
 *     --outfile=/tmp/mshot.mjs --external:@napi-rs/canvas && node /tmp/mshot.mjs
 */
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { installDom, findCoast } from './render-shot';

interface Shot {
  file: string;
  W: number;
  H: number;
  mode?: 'open' | 'carrier';
  ac?: string;
  tod?: 'dawn' | 'day' | 'dusk' | 'night';
  weather?: string;
  agl?: number;
  x?: number;
  gear?: number;
  flaps?: number;
  /** carrier offset in metres, + = ahead of the aircraft, − = behind */
  wx?: number;
  hook?: boolean;
  mission?: boolean;
  deckH?: number;
  /** absolute world altitude in metres (overrides the AGL hold) */
  y?: number;
  /** crash the aircraft just before the frame, to check the crash card */
  kill?: boolean;
  /** set false to render the classic desktop HUD */
  compact?: boolean;
  barW?: number;
  zoom?: number;
  paused?: boolean;
}

export async function mobileShots(shots: Shot[]): Promise<void> {
  installDom();
  const { Renderer } = await import('../src/game/render');
  const { Sim } = await import('../src/game/sim');
  const { AIRCRAFT } = await import('../src/game/aircraft');
  const { generateMission } = await import('../src/game/missions');
  const { terrainHeight } = await import('../src/game/world');

  for (const o of shots) {
    const mode = o.mode ?? 'open';
    const cv: any = createCanvas(o.W, o.H);
    cv.style = {};
    const r: any = new Renderer(cv, o.tod ?? 'day');
    r.resize(o.W, o.H, 1);
    const spec: any = AIRCRAFT.find((a: any) => a.id === (o.ac ?? 'pc21'));
    const mission = o.mission ? generateMission({ mode, x: 0, seed: 7, rankIndex: 2 }) : null;
    const sim: any = new Sim({
      mode,
      spec,
      tod: o.tod ?? 'day',
      startAir: true,
      weather: o.weather ?? (mission ? mission.weather : 'clear'),
      mission,
      sandbox: null,
    });
    await new Promise((res) => setTimeout(res, 80));
    const dt = 1 / 60;
    const agl = o.agl ?? 160;
    if (o.x !== undefined) sim.x = o.x;
    // the carrier/runway the aids are measured against: ahead (OLS) or behind (glidepath strip)
    if (mode === 'carrier') sim.carrier.x = sim.x + (o.wx ?? 0);
    const IN = { pitch: 0, thr: 0, brake: false, rudder: 0 };
    const hold = () => {
      sim.y = o.y !== undefined ? o.y : terrainHeight(sim.x, mode) + agl;
      sim.vy = -1.4;
      sim.alive = true;
      sim.grounded = false;
      sim.vx = mode === 'carrier' ? 62 : 95;
      if (o.gear !== undefined) sim.gear = o.gear;
      if (o.flaps !== undefined) sim.flaps = o.flaps;
      if (o.hook !== undefined) sim.hook = o.hook;
    };
    hold();
    for (let i = 0; i < 40; i++) {
      sim.update(dt, IN);
      if (o.x !== undefined) sim.x = o.x;
      sim.catHeld = false;
      hold();
    }
    if (o.zoom) r.userZoom = o.zoom;
    const extra = {
      paused: !!o.paused,
      fps: 60,
      muted: false,
      showHelp: false,
      warp: 1,
      compact: o.compact !== false,
      insetBottom: o.deckH ?? 140,
      insetRight: o.barW ?? 104,
    };
    for (let i = 0; i < 40; i++) {
      sim.update(dt, IN);
      if (o.x !== undefined) sim.x = o.x;
      sim.catHeld = false;
      hold();
      if (o.kill) {
        sim.alive = false;
        sim.crashReason = 'Stalled into the water';
      }
      if (i % 6 === 0 && sim.mission) for (const g of sim.mission.pending.splice(0)) void g;
      r.frame(sim, dt, extra);
    }
    writeFileSync(o.file, cv.toBuffer('image/png'));
    console.log('  wrote', o.file, `${o.W}x${o.H}`, `zoom ${r.cam.zoom.toFixed(2)}`);
  }
}

if (process.argv[1]?.includes('mshot')) {
  const coast = await findCoast(2000);
  await mobileShots([
    { file: '/tmp/m-open-portrait.png', W: 390, H: 844, mode: 'open', ac: 'pc21', agl: 240, mission: true },
    { file: '/tmp/m-open-landscape.png', W: 844, H: 390, mode: 'open', ac: 'pc21', agl: 240, mission: true, deckH: 96 },
    { file: '/tmp/m-carrier.png', W: 390, H: 844, mode: 'carrier', ac: 'ef18', y: 100, gear: 1, flaps: 2, hook: true, wx: 1200 },
    { file: '/tmp/m-carrier-strip.png', W: 390, H: 844, mode: 'carrier', ac: 'ef18', y: 118, gear: 1, flaps: 2, hook: true, wx: 1200 },
    { file: '/tmp/m-coast.png', W: 390, H: 844, mode: 'open', ac: 'cn235', agl: 120, x: coast, gear: 1, flaps: 1, weather: 'fog' },
    { file: '/tmp/m-crash.png', W: 390, H: 844, mode: 'open', ac: 'pc21', agl: 200, mission: true, deckH: 190, kill: true },
    { file: '/tmp/m-landscape-deck.png', W: 844, H: 390, mode: 'open', ac: 'pc21', agl: 240, mission: true, deckH: 96 },
    { file: '/tmp/m-desktop.png', W: 1280, H: 720, mode: 'open', ac: 'ef18', agl: 300, mission: true, compact: false },
  ]);
}
