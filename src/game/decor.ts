/**
 * Scenery sprites.
 *
 * Hand-drawn artwork for the landscape (trees, houses, towers, masts, wind
 * turbines…). Everything is positioned by its real height in metres, so the
 * world keeps its scale whatever the zoom is: the renderer only has to say
 * "draw this sprite standing on that ground point, 14 m tall".
 */

export interface DecorSprite {
  img: HTMLImageElement;
  /** natural aspect ratio (width / height) */
  aspect: number;
  ready: boolean;
}

const cache = new Map<string, DecorSprite>();

/** Sprite keys → files under public/images/scenery. */
export const DECOR = {
  pine: 'images/scenery/tree-pine.png',
  oak: 'images/scenery/tree-oak.png',
  house: 'images/scenery/house.png',
  atc: 'images/scenery/atc.png',
  mast: 'images/scenery/mast.png',
  turbine: 'images/scenery/turbine.png',
  block: 'images/scenery/block.png',
  barn: 'images/scenery/barn.png',
  lighthouse: 'images/scenery/lighthouse.png',
} as const;

export type DecorKey = keyof typeof DECOR;

export function decorSprite(src: string): DecorSprite | null {
  if (typeof Image === 'undefined') return null; // headless: no images
  let rec = cache.get(src);
  if (!rec) {
    const img = new Image();
    rec = { img, aspect: 1, ready: false };
    img.onload = () => {
      rec!.ready = true;
      rec!.aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
    };
    img.src = src;
    cache.set(src, rec);
  }
  return rec.ready ? rec : null;
}

export interface DecorOpts {
  /** mirror the artwork horizontally */
  flip?: boolean;
  /** 0..1 multiplier on the sprite brightness (night, storms…) */
  bright?: number;
  alpha?: number;
}

/**
 * Draw a scenery sprite standing on a screen point.
 *
 * @param px       screen x of the sprite's centre
 * @param baseY    screen y of the ground the sprite stands on
 * @param heightPx sprite height in screen pixels
 */
export function drawDecorSprite(
  ctx: CanvasRenderingContext2D,
  spr: DecorSprite,
  px: number,
  baseY: number,
  heightPx: number,
  opts: DecorOpts = {},
): void {
  const h = Math.max(2, heightPx);
  const w = h * spr.aspect;
  const bright = opts.bright ?? 1;
  const alpha = opts.alpha ?? 1;
  if (alpha < 0.99) ctx.globalAlpha = alpha;
  const filter = bright < 0.97 ? `brightness(${bright.toFixed(2)})` : '';
  const prev = ctx.filter;
  if (filter) ctx.filter = filter;
  if (opts.flip) {
    ctx.save();
    ctx.translate(px + w / 2, baseY - h);
    ctx.scale(-1, 1);
    ctx.drawImage(spr.img, 0, 0, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(spr.img, px - w / 2, baseY - h, w, h);
  }
  if (filter) ctx.filter = prev;
  if (alpha < 0.99) ctx.globalAlpha = 1;
}

/** Warm up the cache so the first frame does not pop in. */
export function preloadDecor(): void {
  for (const src of Object.values(DECOR)) decorSprite(src);
}
