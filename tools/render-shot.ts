/**
 * Headless frame renderer — the only way to *look* at the game without a
 * browser in this environment. It boots the real Renderer + Sim against
 * @napi-rs/canvas, with a small DOM stub (Image / document.createElement).
 *
 *   npx esbuild tools/render-shot.ts --bundle --platform=node --format=esm \
 *     --outfile=/tmp/shot.mjs --external:@napi-rs/canvas && node /tmp/shot.mjs
 *
 * Requires @napi-rs/canvas to be installed somewhere on NODE_PATH.
 */
import { createCanvas, loadImage, Image as NImage } from '@napi-rs/canvas';
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import * as path from 'node:path';

const PUB = process.env.GAME_PUBLIC ?? path.resolve('public');

// ---------------------------------------------------------------- DOM stub
const decoded = new Map<string, any>();
export async function preloadPublic(): Promise<number> {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = path.join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : p.endsWith('.png') ? [p] : [];
    });
  for (const file of walk(PUB)) {
    decoded.set(path.relative(PUB, file).split(path.sep).join('/'), await loadImage(file));
  }
  return decoded.size;
}

export function installDom(): void {
  const copies = new Map<string, any>();
  const copyOf = (rel: string): any => {
    let cv = copies.get(rel);
    if (cv) return cv;
    const src = decoded.get(rel);
    if (!src) throw new Error(`missing image ${rel}`);
    cv = createCanvas(src.width, src.height);
    cv.getContext('2d').drawImage(src, 0, 0);
    Object.defineProperties(cv, {
      naturalWidth: { get: () => cv.width },
      naturalHeight: { get: () => cv.height },
      complete: { value: true },
    });
    copies.set(rel, cv);
    return cv;
  };
  (globalThis as any).Image = function ImageStub(this: any) {
    const img: any = { onload: null, onerror: null, _src: '' };
    Object.defineProperty(img, 'src', {
      configurable: true,
      get: () => img._src,
      set: (v: string) => {
        img._src = v;
        try {
          const cv = copyOf(v);
          img._cv = cv;
          Object.defineProperties(img, {
            width: { get: () => cv.width },
            height: { get: () => cv.height },
            naturalWidth: { get: () => cv.width },
            naturalHeight: { get: () => cv.height },
          });
          if (img.onload) img.onload();
        } catch {
          if (img.onerror) img.onerror();
        }
      },
    });
    return img;
  };
  (globalThis as any).document = { createElement: (t: string) => (t === 'canvas' ? createCanvas(8, 8) : { style: {} }) };
  (globalThis as any).window = { devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720 };
  const proto = Object.getPrototypeOf(createCanvas(1, 1).getContext('2d')) as any;
  const orig = proto.drawImage;
  proto.drawImage = function (img: any, ...rest: any[]) {
    return orig.call(this, img && img._cv ? img._cv : img, ...rest);
  };
}

// ---------------------------------------------------------------- frames
const W = 1280;
const H = 720;

export interface Shot {
  file: string;
  /** aircraft id */
  ac: string;
  /** time of day */
  tod: 'dawn' | 'day' | 'dusk' | 'night';
  weather: string;
  mode?: 'open' | 'carrier';
  /** world x in metres */
  x?: number;
  /** height above the ground, metres */
  agl?: number;
  /** zoom multiplier on top of the automatic camera zoom */
  zoom?: number;
  gear?: number;
  vx?: number;
  /** if set, the aircraft is kept at this world altitude instead of an AGL one */
  y?: number;
}

export async function shoot(shoots: Shot[]): Promise<void> {
  const n = await preloadPublic();
  installDom();
  const { Renderer } = await import('../src/game/render');
  const { Sim } = await import('../src/game/sim');
  const { AIRCRAFT } = await import('../src/game/aircraft');
  const { terrainHeight } = await import('../src/game/world');
  console.log(`render-shot: ${n} sprites decoded`);
  for (const o of shoots) {
    const cv: any = createCanvas(W, H);
    cv.style = {};
    const r: any = new Renderer(cv, o.tod);
    r.resize(W, H, 1);
    const mode = o.mode ?? 'open';
    const spec: any = AIRCRAFT.find((a: any) => a.id === o.ac);
    if (!spec) throw new Error(`unknown aircraft ${o.ac}`);
    const sim: any = new Sim({ mode, spec, tod: o.tod, startAir: true, weather: o.weather, mission: null, sandbox: null } as any);
    await new Promise((res) => setTimeout(res, 60));
    const dt = 1 / 60;
    sim.x = o.x ?? 0;
    const hold = () => {
      sim.y = o.y !== undefined ? o.y : terrainHeight(sim.x, mode) + (o.agl ?? 80);
      sim.vy = 0;
      sim.p = 0;
      sim.w = 0;
      sim.alive = true;
      sim.grounded = false;
      sim.vx = o.vx ?? 120;
      if (o.gear !== undefined) sim.gear = o.gear;
    };
    hold();
    for (let i = 0; i < 30; i++) {
      sim.step(dt);
      hold();
    }
    if (o.zoom) r.userZoom = o.zoom;
    for (let i = 0; i < 40; i++) {
      sim.step(dt);
      hold();
      r.frame(sim, dt, { fps: 60, warp: 1 });
    }
    writeFileSync(o.file, cv.toBuffer('image/png'));
    console.log('  wrote', o.file, `zoom ${r.cam.zoom.toFixed(2)}`);
  }
}

/** A coastline x where the land rises out of the sea, handy for shots. */
export async function findCoast(startX = 2000): Promise<number> {
  installDom();
  const { terrainHeight } = await import('../src/game/world');
  for (let x = startX; x < 400000; x += 50) {
    if (terrainHeight(x, 'open') < 0 && terrainHeight(x + 50, 'open') >= 2) return x;
  }
  return 0;
}
