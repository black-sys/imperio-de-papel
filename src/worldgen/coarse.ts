import { standingWaterAt, terrainHeight } from './chunk';
import { CELL, CHUNK, CHUNKS_PER_SIDE, HEIGHT_SCALE } from './constants';
import { Biome, type WorldMap } from './types';

/** Chunk simplificado para LOD: só terreno, bioma e mar/lago por bloco de step×step tiles. */
export interface CoarseChunk {
  cx: number;
  cy: number;
  step: number;
  heights: Float32Array; // (CHUNK/step + 1)² vértices
  biome: Uint8Array; // (CHUNK/step)² blocos
  water: Uint8Array; // 0 seco, 1 oceano, 2 lago
  waterLevel: Float32Array;
}

export function generateCoarseChunk(map: WorldMap, cx: number, cy: number, step: 2 | 4): CoarseChunk {
  const B = CHUNK / step, N = B + 1;
  const heights = new Float32Array(N * N), biome = new Uint8Array(B * B), water = new Uint8Array(B * B), waterLevel = new Float32Array(B * B);
  if (cx < 0 || cy < 0 || cx >= CHUNKS_PER_SIDE || cy >= CHUNKS_PER_SIDE) {
    heights.fill(-HEIGHT_SCALE * 0.2); water.fill(1);
    return { cx, cy, step, heights, biome, water, waterLevel };
  }
  const ox = cx * CHUNK, oy = cy * CHUNK;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) heights[j * N + i] = terrainHeight(map, ox + i * step, oy + j * step);
  for (let j = 0; j < B; j++) for (let i = 0; i < B; i++) {
    const b = j * B + i, gx = ox + (i + 0.5) * step, gy = oy + (j + 0.5) * step;
    const top = Math.max(heights[j * N + i], heights[j * N + i + 1], heights[(j + 1) * N + i], heights[(j + 1) * N + i + 1]);
    const st = standingWaterAt(map, gx, gy, top);
    const cell = Math.min(map.size - 1, Math.floor(gy / CELL)) * map.size + Math.min(map.size - 1, Math.floor(gx / CELL));
    if (st) { water[b] = st.type; waterLevel[b] = st.level; biome[b] = Biome.Ocean; }
    else biome[b] = map.biome[cell] === Biome.Ocean ? Biome.Beach : map.biome[cell];
  }
  return { cx, cy, step, heights, biome, water, waterLevel };
}
