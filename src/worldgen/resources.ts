import { CHUNK, FORD_MAX_WIDTH, MAX_WALK_SLOPE } from './constants';
import { makeRng, subSeed } from './rng';
import { Biome, type ChunkData, type Resource, type ResourceKind, type WorldMap } from './types';

const V = CHUNK + 1;
/** Densidade por tile e tipo, por bioma (somadas = chance total de recurso). */
const DENSITY: Partial<Record<Biome, [ResourceKind, number][]>> = {
  [Biome.TemperateForest]: [['tree', 0.25]],
  [Biome.Taiga]: [['pine', 0.25]],
  [Biome.Jungle]: [['tree', 0.3]],
  [Biome.Swamp]: [['tree', 0.08]],
  [Biome.Savanna]: [['tree', 0.03]],
  [Biome.Grassland]: [['tree', 0.02], ['rock', 0.01]],
  [Biome.Desert]: [['cactus', 0.015], ['rock', 0.01]],
  [Biome.Mountain]: [['rock', 0.04]],
  [Biome.Snow]: [['rock', 0.01]],
};

export function walkability(c: ChunkData): Uint8Array {
  const walk = new Uint8Array(CHUNK * CHUNK);
  for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
    const t = y * CHUNK + x, w = c.water[t];
    if (w === 1 || w === 2) continue;
    if (w === 3) { walk[t] = c.riverWidth[t] <= FORD_MAX_WIDTH ? 2 : 0; continue; }
    const h = c.heights, a = h[y * V + x], b = h[y * V + x + 1], d = h[(y + 1) * V + x], e = h[(y + 1) * V + x + 1];
    walk[t] = Math.max(a, b, d, e) - Math.min(a, b, d, e) > MAX_WALK_SLOPE ? 0 : 1;
  }
  return walk;
}

export function placeResources(seed: number, c: ChunkData, skipTile = -1): Resource[] {
  const rng = makeRng(subSeed(seed, `res:${c.cx},${c.cy}`));
  const out: Resource[] = [];
  for (let t = 0; t < CHUNK * CHUNK; t++) {
    const r = rng(), jx = rng(), jy = rng(); // sempre 3 sorteios por tile: IDs não dependem de outros tiles
    if (c.walk[t] !== 1 || t === skipTile) continue;
    let acc = 0;
    for (const [kind, p] of DENSITY[c.biome[t] as Biome] ?? []) {
      acc += p;
      if (r >= acc) continue;
      const x = c.cx * CHUNK + (t % CHUNK) + 0.5 + (jx - 0.5) * 0.6;
      const y = c.cy * CHUNK + Math.floor(t / CHUNK) + 0.5 + (jy - 0.5) * 0.6;
      out.push({ id: `c${c.cx}_${c.cy}#${out.length}`, kind, x, y });
      break;
    }
  }
  return out;
}

/** Preenche walk e resources; o tile do spawn fica sempre livre. */
export function finishChunk(map: WorldMap, c: ChunkData): ChunkData {
  c.walk = walkability(c);
  const sx = Math.floor(map.spawn.x) - c.cx * CHUNK, sy = Math.floor(map.spawn.y) - c.cy * CHUNK;
  const spawnTile = sx >= 0 && sy >= 0 && sx < CHUNK && sy < CHUNK ? sy * CHUNK + sx : -1;
  if (spawnTile >= 0 && c.walk[spawnTile] === 0 && c.water[spawnTile] === 0) c.walk[spawnTile] = 1;
  c.resources = placeResources(map.seed, c, spawnTile);
  for (const r of c.resources) c.walk[(Math.floor(r.y) - c.cy * CHUNK) * CHUNK + Math.floor(r.x) - c.cx * CHUNK] = 0;
  return c;
}
