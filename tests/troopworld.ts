import { chooseCapital, setSpeed } from '../src/sim/commands';
import { labelLand, type MoveGrid } from '../src/sim/movegrid';
import { newGame, type GameState } from '../src/sim/state';
import { tick } from '../src/sim/tick';
import type { Province, ProvinceMap } from '../src/worldgen/provinces';
import { Biome } from '../src/worldgen/types';

/**
 * Mundo de teste 64² células (256² tiles): rio (custo 3) na coluna x=32 com ponte em y=10; lago em x,y∈[40,50];
 * floresta (cobertura) em x∈[0,8]. Província 0 = x<32, província 1 = x≥32.
 */
export function makeTestWorld(): { pm: ProvinceMap; grid: MoveGrid } {
  const size = 64, cost = new Uint8Array(size * size).fill(1), cover = new Uint8Array(size * size), cellProvince = new Int16Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = y * size + x;
    cellProvince[i] = x < 32 ? 0 : 1;
    if (x === 32 && y !== 10) cost[i] = 3;
    if (x >= 40 && x <= 50 && y >= 40 && y <= 50) { cost[i] = 0; cellProvince[i] = -1; }
    if (x <= 8) cover[i] = 1;
  }
  const prov = (id: number, cx: number): Province => ({
    id, name: `P${id}`, center: { x: cx, y: 128 }, cells: 2000, neighbors: [1 - id], coastal: false, biome: Biome.Grassland,
    fertility: 1, forest: 1, rock: 1, city: { x: cx, y: 80 },
    lots: [{ x: cx, y: 100 }, { x: cx + 20, y: 80 }, { x: cx + 20, y: 100 }, { x: cx + 8, y: 92 }],
    veins: [{ kind: 'grain', richness: 1, x: cx - 40, y: 40 }, { kind: 'wood', richness: 1, x: cx + 40, y: 40 }, { kind: 'coal', richness: 1, x: cx - 40, y: 200 }, { kind: 'iron', richness: 1, x: cx + 40, y: 200 }],
  });
  return { grid: { size, cost, cover, land: labelLand(size, cost) }, pm: { cellProvince, suggestedCapitals: [0], provinces: [prov(0, 60), prov(1, 180)] } };
}

export const world = makeTestWorld();
/** Capital na província 0 (cidade nível 2), guarnição pronta no lote 1 e recursos de sobra. */
export const game = (level = 1): GameState => {
  const s = newGame(world.pm);
  chooseCapital(s, world.pm, 0);
  s.lots[0][1] = { type: 'garrison', level, remaining: 0 };
  s.res = { money: 1000, grain: 1000, wood: 1000, coal: 1000, iron: 1000, steel: 1000, arms: 1000 };
  return s;
};
/** Avança `months` na velocidade dada, em ticks de 0.1 s. */
export const run = (s: GameState, months: number, speed = 1) => { setSpeed(s, speed); for (let i = 0; i < Math.round((months * 100) / speed); i++) tick(s, world.pm, 0.1, world.grid); };
