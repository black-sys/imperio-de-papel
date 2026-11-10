import { CELL, GLOBAL_SIZE } from '../constants';
import { subSeed } from '../rng';
import { Biome, type WorldMap } from '../types';
import { biomeMap, temperatureMap } from './biomes';
import { runHydrology } from './hydrology';
import { windMoisture } from './moisture';
import { applyPlates } from './plates';
import { landShape } from './shape';

export function generateWorld(seed: number, onProgress?: (stage: string, pct: number) => void): WorldMap {
  const S = GLOBAL_SIZE;
  const p = onProgress ?? (() => {});
  p('forma', 0);
  const { base, land } = landShape(subSeed(seed, 'forma'), S);
  p('placas', 0.2);
  const plated = applyPlates(subSeed(seed, 'placas'), S, base, land);
  p('umidade', 0.4);
  const moisture = windMoisture(S, plated, land, subSeed(seed, 'umidade'));
  p('rios', 0.55);
  const hy = runHydrology(S, plated, land, moisture);
  p('biomas', 0.85);
  const temperature = temperatureMap(S, hy.elevation, subSeed(seed, 'temperatura'));
  const biome = biomeMap(S, hy.elevation, temperature, moisture, hy.water);
  return { seed, size: S, ...hy, moisture, temperature, biome, spawn: findSpawn(S, biome, hy.water, hy.river, hy.elevation) };
}

/** Célula de campo/floresta seca, sem rio, plana e cercada de terra, mais próxima do centro → tile central dela. */
function findSpawn(size: number, biome: Uint8Array, water: Uint8Array, river: Uint8Array, elevation: Float32Array): { x: number; y: number } {
  const c = size / 2;
  const firm = (i: number, maxSlope: number) => {
    const x = i % size, y = Math.floor(i / size);
    if (x < 1 || y < 1 || x >= size - 1 || y >= size - 1) return false;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const n = i + dy * size + dx;
      if (water[n] || river[n] || Math.abs(elevation[n] - elevation[i]) > maxSlope) return false;
    }
    return true;
  };
  for (const maxSlope of [0.012, 0.03, 1].map(v => (v * 512) / size)) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < biome.length; i++) {
      if (biome[i] !== Biome.Grassland && biome[i] !== Biome.TemperateForest) continue;
      const dx = (i % size) - c, dy = Math.floor(i / size) - c, d = dx * dx + dy * dy;
      if (d < bd && firm(i, maxSlope)) { bd = d; best = i; }
    }
    if (best >= 0) return { x: (best % size) * CELL + CELL / 2, y: Math.floor(best / size) * CELL + CELL / 2 };
  }
  const any = water.findIndex((w, i) => w === 0 && !river[i]);
  return { x: (any % size) * CELL + CELL / 2, y: Math.floor(any / size) * CELL + CELL / 2 };
}

/** Tile central da célula de terra seca (sem água nem rio) mais próxima de (x, y) em tiles. */
export function nearestLandTile(map: WorldMap, x: number, y: number): { x: number; y: number } | null {
  const s = map.size, cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
  for (let r = 0; r < s; r++) {
    let best = -1, bd = Infinity;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= s || ny >= s) continue;
      const i = ny * s + nx;
      if (map.water[i] || map.river[i]) continue;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    if (best >= 0) return { x: (best % s) * CELL + CELL / 2, y: Math.floor(best / s) * CELL + CELL / 2 };
  }
  return null;
}
