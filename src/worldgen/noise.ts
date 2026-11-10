function hash(x: number, y: number, s: number): number {
  let r = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  r = Math.imul(r ^ (r >>> 13) ^ s, 1274126177);
  return ((r ^ (r >>> 16)) >>> 0) / 4294967295;
}
const smooth = (t: number) => t * t * (3 - 2 * t);

export function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = smooth(x - xi), fy = smooth(y - yi);
  const a = hash(xi, yi, seed), b = hash(xi + 1, yi, seed);
  const c = hash(xi, yi + 1, seed), d = hash(xi + 1, yi + 1, seed);
  const top = a + (b - a) * fx, bot = c + (d - c) * fx;
  return top + (bot - top) * fy;
}

export function fbm(x: number, y: number, seed: number, octaves: number): number {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * freq, y * freq, (seed + i * 131) | 0) * amp;
    norm += amp; amp *= 0.5; freq *= 2;
  }
  return sum / norm;
}

export function ridged(x: number, y: number, seed: number, octaves: number): number {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    const n = 1 - Math.abs(valueNoise(x * freq, y * freq, (seed + i * 197) | 0) * 2 - 1);
    sum += n * n * amp;
    norm += amp; amp *= 0.5; freq *= 2;
  }
  return sum / norm;
}

/** Desloca (x,y) até ±strength/2 em cada eixo. */
export function warp(x: number, y: number, seed: number, strength: number): [number, number] {
  return [
    x + (fbm(x, y, (seed + 17) | 0, 3) - 0.5) * strength,
    y + (fbm(x, y, (seed + 53) | 0, 3) - 0.5) * strength,
  ];
}
