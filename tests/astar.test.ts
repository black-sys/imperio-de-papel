import { expect, test } from 'vitest';
import { findCellPath } from '../src/sim/astar';
import { makeMoveGrid, type MoveGrid } from '../src/sim/movegrid';
import { generateWorld } from '../src/worldgen/global/world';
import { makeTestWorld } from './troopworld';

const open = (size: number): MoveGrid => ({ size, cost: new Uint8Array(size * size).fill(1), cover: new Uint8Array(size * size) });
const at = (g: MoveGrid, x: number, y: number) => y * g.size + x;

test('caminho reto', () => {
  const g = open(64), p = findCellPath(g, at(g, 0, 0), at(g, 10, 0))!;
  expect(p.length).toBe(10);
  expect(p.at(-1)).toBe(10);
  expect(findCellPath(g, 5, 5)).toEqual([]);
});
test('contorna o lago', () => {
  const { grid: g } = makeTestWorld(), p = findCellPath(g, at(g, 36, 45), at(g, 56, 45))!;
  expect(p.length).toBeGreaterThan(20);
  expect(p.every(c => g.cost[c] !== 0)).toBe(true);
});
test('prefere a ponte quando compensa; cruza o rio quando a ponte está longe', () => {
  const { grid: g } = makeTestWorld();
  expect(findCellPath(g, at(g, 28, 10), at(g, 36, 12))!.every(c => g.cost[c] !== 3)).toBe(true);
  expect(findCellPath(g, at(g, 28, 40), at(g, 36, 40))!.some(c => g.cost[c] === 3)).toBe(true);
});
test('não corta quina de bloqueado', () => {
  const g = open(8);
  g.cost[at(g, 1, 0)] = 0; g.cost[at(g, 0, 1)] = 0;
  expect(findCellPath(g, at(g, 0, 0), at(g, 1, 1))).toBeNull(); // (0,0) fica cercado
  g.cost[at(g, 0, 1)] = 1;
  expect(findCellPath(g, at(g, 0, 0), at(g, 1, 1))!.length).toBe(2); // contorna em vez de passar na diagonal
});
test('inalcançável → null', () => {
  const { grid: g } = makeTestWorld();
  expect(findCellPath(g, at(g, 5, 5), at(g, 45, 45))).toBeNull(); // dentro do lago
  for (let d = -1; d <= 1; d++) for (let e = -1; e <= 1; e++) if (d || e) g.cost[at(g, 20 + d, 20 + e)] = 0;
  expect(findCellPath(g, at(g, 5, 5), at(g, 20, 20))).toBeNull(); // cercado
  expect(findCellPath(g, -1, 5)).toBeNull();
});
test('desempenho: > 1000 células no mapa 1024² em < 300 ms', () => {
  const g = open(1024);
  for (let y = 0; y < 1000; y++) g.cost[at(g, 500, y)] = 0;
  const t = performance.now(), p = findCellPath(g, at(g, 10, 10), at(g, 1000, 10))!;
  expect(performance.now() - t).toBeLessThan(300);
  expect(p.length).toBeGreaterThan(1000);
});
test('makeMoveGrid: água bloqueia, rio custa 3', { timeout: 30000 }, () => {
  const map = generateWorld(1), g = makeMoveGrid(map);
  expect(g.size).toBe(map.size);
  let rivers = 0, bad = 0;
  for (let i = 0; i < g.cost.length; i++) {
    const want = map.water[i] ? [0] : map.river[i] ? [3] : [1, 2];
    if (!want.includes(g.cost[i])) bad++;
    if (g.cost[i] === 3) rivers++;
  }
  expect(bad).toBe(0);
  expect(rivers).toBeGreaterThan(0);
});
