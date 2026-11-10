import { Biome, type WorldMap } from '../worldgen/types';

const hash = (x: number, y: number) => {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Mapa estratégico estilo pergaminho (RGBA size×size): papel, relevo em sépia, litoral contornado, florestas pontilhadas. */
export function renderParchment(map: WorldMap, size: number): Uint8ClampedArray {
  const S = map.size, out = new Uint8ClampedArray(size * size * 4), k = S / size;
  const cell = (x: number, y: number) => Math.min(S - 1, Math.max(0, Math.floor(y))) * S + Math.min(S - 1, Math.max(0, Math.floor(x)));
  const E = (x: number, y: number) => map.elevation[cell(x, y)];
  const ocean = (x: number, y: number) => map.water[cell(x, y)] === 1;
  const lw = Math.max(1, k); // espessura do contorno em células
  for (let oy = 0; oy < size; oy++) for (let ox = 0; ox < size; ox++) {
    const x = ox * k, y = oy * k, i = cell(x, y), o = (oy * size + ox) * 4, g = 0.93 + hash(ox, oy) * 0.07;
    let c: [number, number, number];
    const w = ocean(x, y);
    if (ocean(x + lw, y) !== w || ocean(x - lw, y) !== w || ocean(x, y + lw) !== w || ocean(x, y - lw) !== w) c = [90, 60, 35];
    else if (w) {
      const ripple = Math.floor(oy / 3) % 7 === 0 && hash(ox >> 3, oy) > 0.6 ? 0.92 : 1;
      c = [176 * g * ripple, 188 * g * ripple, 176 * g * ripple];
    } else if (map.water[i] === 2 || map.river[i]) c = [70, 95, 120];
    else {
      const dx = (E(x + 1, y) - E(x - 1, y)) * 60, dy = (E(x, y + 1) - E(x, y - 1)) * 60;
      const s = Math.max(0.35, Math.min(1.4, 1 - dx * 0.7 - dy * 0.7));
      let base: [number, number, number] = [232, 216, 176];
      const b = map.biome[i], h = hash(ox, oy);
      if ((b === Biome.TemperateForest || b === Biome.Taiga || b === Biome.Jungle) && h > 0.82) base = [80, 100, 55];
      else if (b === Biome.Desert && h > 0.9) base = [190, 150, 90];
      c = [base[0] * g * (0.55 + 0.45 * s), base[1] * g * (0.55 + 0.45 * s), base[2] * g * (0.6 + 0.4 * s)];
    }
    out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
  }
  return out;
}
