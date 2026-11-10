import { CELL, MOUNTAIN_LEVEL } from '../worldgen/constants';
import { Biome, type WorldMap } from '../worldgen/types';

/** Grade de movimento das tropas, uma entrada por célula global. Derivada do mapa: não entra no save. */
export interface MoveGrid {
  size: number;
  cost: Uint8Array; // 0 bloqueado; senão multiplica o tempo de travessia (1 normal, 2 difícil, 3 rio)
  cover: Uint8Array; // 1 = floresta ou colina (bônus de defesa)
}

export function makeMoveGrid(map: WorldMap): MoveGrid {
  const n = map.size * map.size, cost = new Uint8Array(n), cover = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const b = map.biome[i];
    cost[i] = map.water[i] ? 0 : map.river[i] ? 3 : b === Biome.Mountain || b === Biome.Snow || b === Biome.Swamp ? 2 : 1;
    cover[i] = b === Biome.Taiga || b === Biome.TemperateForest || b === Biome.Jungle || map.elevation[i] >= MOUNTAIN_LEVEL - 0.1 ? 1 : 0;
  }
  return { size: map.size, cost, cover };
}

/** Célula que contém o tile (x, y); −1 fora do mapa. */
export function cellAt(grid: MoveGrid, x: number, y: number): number {
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
  return cx < 0 || cy < 0 || cx >= grid.size || cy >= grid.size ? -1 : cy * grid.size + cx;
}
