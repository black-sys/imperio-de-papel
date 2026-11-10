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
  return { seed, size: S, ...hy, moisture, temperature, biome, spawn: findSpawn(S, biome, hy.water) };
}

/** Célula de campo/floresta seca mais próxima do centro → tile central dela. */
function findSpawn(size: number, biome: Uint8Array, water: Uint8Array): { x: number; y: number } {
  const c = size / 2;
  let best = -1, bd = Infinity;
  for (let i = 0; i < biome.length; i++) {
    if (water[i] || (biome[i] !== Biome.Grassland && biome[i] !== Biome.TemperateForest)) continue;
    const dx = (i % size) - c, dy = Math.floor(i / size) - c, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  if (best < 0) best = biome.findIndex((_, i) => water[i] === 0);
  return { x: (best % size) * CELL + CELL / 2, y: Math.floor(best / size) * CELL + CELL / 2 };
}
