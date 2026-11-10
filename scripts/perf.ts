import { generateWorld } from '../src/worldgen/global/world';

const t0 = performance.now();
generateWorld(860);
const g = performance.now() - t0;
console.log(`global: ${g.toFixed(0)} ms (meta 3000)`);
