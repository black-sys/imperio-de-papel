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
