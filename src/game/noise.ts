export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function hash(n: number): number {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const s = seed * 57.3;
  return hash(i + s) * (1 - u) + hash(i + 1 + s) * u;
}

export function fbm(x: number, seed = 0, oct = 4): number {
  let a = 0.5;
  let f = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += a * noise1(x * f, seed + o * 3.7);
    norm += a;
    a *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

export function hash2(x: number, y: number): number {
  const v = Math.sin(x * 127.1 + y * 311.7 + 74.7) * 43758.5453;
  return v - Math.floor(v);
}

export function noise2(x: number, y: number, seed = 0): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const s = seed * 41.7;
  const a = hash2(ix + s, iy + s);
  const b = hash2(ix + 1 + s, iy + s);
  const c = hash2(ix + s, iy + 1 + s);
  const d = hash2(ix + 1 + s, iy + 1 + s);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy);
}

export function fbm2(x: number, y: number, seed = 0, oct = 3): number {
  let a = 0.5;
  let f = 1;
  let sum = 0;
  let norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += a * noise2(x * f, y * f, seed + o * 3.7);
    norm += a;
    a *= 0.5;
    f *= 2.03;
  }
  return sum / norm;
}

export function wrapPi(a: number): number {
  const t = Math.PI * 2;
  let r = (a + Math.PI) % t;
  if (r < 0) r += t;
  return r - Math.PI;
}

export type RGB = [number, number, number];
export const mixRGB = (a: number[], b: number[], t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
