import { generateChunk } from '../src/worldgen/chunk';
import { generateWorld } from '../src/worldgen/global/world';

const t0 = performance.now();
const map = generateWorld(860);
console.log(`global: ${(performance.now() - t0).toFixed(0)} ms (meta 8000)`);
generateChunk(map, 0, 0); // aquece o índice de rios
const t1 = performance.now();
let water = 0;
for (let i = 0; i < 50; i++) water += generateChunk(map, 20 + (i % 10), 20 + Math.floor(i / 10)).water.filter(v => v).length;
console.log(`chunk: ${((performance.now() - t1) / 50).toFixed(2)} ms média (meta 10) — tiles de água em 50 chunks: ${water}`);
import { makeChunkCache, paintTile } from '../src/client/map/tilePaint';
const chunks = makeChunkCache(map);
for (const L of [0, 3]) {
  paintTile(map, L, 20, 20, chunks); // aquece
  const t2 = performance.now();
  for (let i = 0; i < 20; i++) paintTile(map, L, (L ? 2 : 20) + (i % 5), (L ? 2 : 20) + Math.floor(i / 5), chunks);
  console.log(`ladrilho L${L}: ${((performance.now() - t2) / 20).toFixed(2)} ms média (meta 15, chunks frios em L0)`);
}
