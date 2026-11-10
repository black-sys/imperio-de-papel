import { fbm } from '../noise';

/** Vento oeste→leste carrega umidade do oceano; subidas forçam chuva (sombra de chuva a leste). */
export function windMoisture(size: number, elevation: Float32Array, land: Uint8Array, seed: number): Float32Array {
  const res = size / 512;
  let m = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    let carried = 1;
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      if (!land[i]) { carried += (1 - carried) * (0.15 / res); m[i] = 1; continue; }
      // o degrau mar→terra não conta como subida; só relevo entre células de terra
      const rise = x > 0 && land[i - 1] ? Math.max(0, elevation[i] - elevation[i - 1]) : 0;
      const rain = carried * Math.min(0.6, 0.004 / res + rise * 3);
      carried = Math.max(0, carried - rain);
      const v = carried * 1.05 + rain * 4 * res + (fbm(x / (24 * res), y / (24 * res), seed, 4) - 0.5) * 0.35;
      m[i] = Math.min(1, Math.max(0, v));
    }
  }
  for (let pass = 0; pass < Math.round(2 * res); pass++) m = blur(m, size);
  return m;
}

function blur(src: Float32Array, size: number): Float32Array {
  const out = new Float32Array(src.length);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let s = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < size && ny < size) { s += src[ny * size + nx]; n++; }
    }
    out[y * size + x] = s / n;
  }
  return out;
}
