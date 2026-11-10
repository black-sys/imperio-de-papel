import { MOUNTAIN_LEVEL, SEA_LEVEL } from '../constants';
import { fbm } from '../noise';
import { Biome } from '../types';

/** Norte (y=0) frio, sul quente; esfria com a altitude. */
export function temperatureMap(size: number, elevation: Float32Array, seed: number): Float32Array {
  const t = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    const v = (y / (size - 1)) * 1.2 - 0.1 - Math.max(0, elevation[i] - SEA_LEVEL) * 0.7 + (fbm(x / 30, y / 30, seed, 3) - 0.5) * 0.1;
    t[i] = Math.min(1, Math.max(0, v));
  }
  return t;
}

export function classifyBiome(elev: number, t: number, m: number, water: number, coastal: boolean, slope: number): Biome {
  if (water !== 0) return Biome.Ocean;
  if (coastal && elev < SEA_LEVEL + 0.02) return Biome.Beach;
  if (elev >= MOUNTAIN_LEVEL) return t < 0.2 ? Biome.Snow : Biome.Mountain;
  if (t < 0.15) return Biome.Snow;
  if (t < 0.35) return m > 0.25 ? Biome.Taiga : Biome.Grassland;
  if (t < 0.7) return m < 0.1 ? Biome.Desert : m < 0.3 ? Biome.Grassland : m > 0.75 && slope < 0.004 ? Biome.Swamp : Biome.TemperateForest;
  return m < 0.22 ? Biome.Desert : m < 0.5 ? Biome.Savanna : Biome.Jungle;
}

export function biomeMap(size: number, elevation: Float32Array, temperature: Float32Array, moisture: Float32Array, water: Uint8Array): Uint8Array {
  const out = new Uint8Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    let coastal = false, slope = 0;
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const n = ny * size + nx;
      if (water[n] === 1) coastal = true;
      slope = Math.max(slope, Math.abs(elevation[n] - elevation[i]));
    }
    out[i] = classifyBiome(elevation[i], temperature[i], moisture[i], water[i], coastal, slope);
  }
  return out;
}
