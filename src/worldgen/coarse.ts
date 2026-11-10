import { coveringRiver, riverSegments, standingWaterAt, terrainHeight } from './chunk';
import { CELL, CHUNK, CHUNKS_PER_SIDE, HEIGHT_SCALE } from './constants';
import { Biome, type WorldMap } from './types';

/** Chunk simplificado para LOD: só terreno, bioma e mar/lago por bloco de step×step tiles. */
export interface CoarseChunk {
  cx: number;
  cy: number;
  step: number;
  heights: Float32Array; // (CHUNK/step + 1)² vértices
  biome: Uint8Array; // (CHUNK/step)² blocos
  water: Uint8Array; // 0 seco, 1 oceano, 2 lago, 3 rio
  waterLevel: Float32Array;
}

export function generateCoarseChunk(map: WorldMap, cx: number, cy: number, step: 2 | 4): CoarseChunk {
  const B = CHUNK / step, N = B + 1;
  const heights = new Float32Array(N * N), biome = new Uint8Array(B * B), water = new Uint8Array(B * B), waterLevel = new Float32Array(B * B);
  if (cx < 0 || cy < 0 || cx >= CHUNKS_PER_SIDE || cy >= CHUNKS_PER_SIDE) {
    heights.fill(-HEIGHT_SCALE * 0.2); water.fill(1);
    return { cx, cy, step, heights, biome, water, waterLevel };
  }
  const ox = cx * CHUNK, oy = cy * CHUNK, segs = riverSegments(map, cx, cy);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) heights[j * N + i] = terrainHeight(map, ox + i * step, oy + j * step);
  for (let j = 0; j < B; j++) for (let i = 0; i < B; i++) {
    const b = j * B + i, gx = ox + (i + 0.5) * step, gy = oy + (j + 0.5) * step;
    const top = Math.max(heights[j * N + i], heights[j * N + i + 1], heights[(j + 1) * N + i], heights[(j + 1) * N + i + 1]);
    const st = standingWaterAt(map, gx, gy, top);
    const cell = Math.min(map.size - 1, Math.floor(gy / CELL)) * map.size + Math.min(map.size - 1, Math.floor(gx / CELL));
    biome[b] = map.biome[cell] === Biome.Ocean ? Biome.Beach : map.biome[cell];
    if (st) { water[b] = st.type; waterLevel[b] = st.level; biome[b] = Biome.Ocean; continue; }
    // rio visível de longe: largura mínima de um bloco; superfície um pouco acima da média dos cantos (desenhada a −0.15)
    const r = coveringRiver(segs, gx, gy, step);
    if (r) { water[b] = 3; waterLevel[b] = (heights[j * N + i] + heights[j * N + i + 1] + heights[(j + 1) * N + i] + heights[(j + 1) * N + i + 1]) / 4 + 0.35; }
  }
  return { cx, cy, step, heights, biome, water, waterLevel };
}
