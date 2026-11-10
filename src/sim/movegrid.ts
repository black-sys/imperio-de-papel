import { CELL, MOUNTAIN_LEVEL } from '../worldgen/constants';
import { Biome, type WorldMap } from '../worldgen/types';

/** Grade de movimento das tropas, uma entrada por célula global. Derivada do mapa: não entra no save. */
export interface MoveGrid {
  size: number;
  cost: Uint8Array; // 0 bloqueado; senão multiplica o tempo de travessia (1 normal, 2 difícil, 3 rio)
  cover: Uint8Array; // 1 = floresta ou colina (bônus de defesa)
  land: Int32Array; // massa de terra da célula (0 = bloqueada): rótulos diferentes = sem caminho entre elas
}

export function makeMoveGrid(map: WorldMap): MoveGrid {
  const n = map.size * map.size, cost = new Uint8Array(n), cover = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const b = map.biome[i];
    cost[i] = map.water[i] ? 0 : map.river[i] ? 3 : b === Biome.Mountain || b === Biome.Snow || b === Biome.Swamp ? 2 : 1;
    cover[i] = b === Biome.Taiga || b === Biome.TemperateForest || b === Biome.Jungle || map.elevation[i] >= MOUNTAIN_LEVEL - 0.1 ? 1 : 0;
  }
  return { size: map.size, cost, cover, land: labelLand(map.size, cost) };
}

/** Célula que contém o tile (x, y); −1 fora do mapa. */
export function cellAt(grid: MoveGrid, x: number, y: number): number {
  const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
  return cx < 0 || cy < 0 || cx >= grid.size || cy >= grid.size ? -1 : cy * grid.size + cx;
}

/** Rotula as massas de terra (4-vizinhos: o A* não corta quina, então diagonal sozinha não liga). Evita buscar caminho impossível. */
export function labelLand(size: number, cost: Uint8Array): Int32Array {
  const land = new Int32Array(size * size), stack = new Int32Array(size * size);
  let next = 0;
  for (let start = 0; start < land.length; start++) {
    if (cost[start] === 0 || land[start]) continue;
    let n = 0;
    stack[n++] = start; land[start] = ++next;
    while (n) {
      const i = stack[--n], x = i % size;
      for (const j of [x > 0 ? i - 1 : -1, x < size - 1 ? i + 1 : -1, i - size, i + size])
        if (j >= 0 && j < land.length && cost[j] !== 0 && !land[j]) { land[j] = next; stack[n++] = j; }
    }
  }
  return land;
}
