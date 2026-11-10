import { expect, test } from 'vitest';
import { findPath, nearestWalkable } from '../src/client/astar';

const open = () => 1;
test('caminho reto tem 11 nós', () => {
  const p = findPath(open, { x: 0, y: 0 }, { x: 10, y: 0 })!;
  expect(p.length).toBe(11);
  expect(p.at(-1)).toEqual({ x: 10, y: 0 });
});
test('contorna parede com abertura', () => {
  const wall = (x: number, y: number) => (x === 5 && y !== 8 ? 0 : 1);
  const p = findPath(wall, { x: 0, y: 0 }, { x: 10, y: 0 })!;
  expect(p).not.toBeNull();
  expect(p.some(n => n.x === 5 && n.y === 8)).toBe(true);
  expect(p.every(n => wall(n.x, n.y) !== 0)).toBe(true);
});
test('não corta quina de bloqueado', () => {
  const w = (x: number, y: number) => ((x === 1 && y === 0) || (x === 0 && y === 1) ? 0 : 1);
  const p = findPath(w, { x: 0, y: 0 }, { x: 1, y: 1 })!;
  expect(p.length).toBeGreaterThan(2); // contorna em vez de passar na diagonal entre os dois bloqueios
});
test('destino cercado, bloqueado ou fora do raio → null', () => {
  const ring = (x: number, y: number) => (Math.max(Math.abs(x - 20), Math.abs(y - 20)) === 1 ? 0 : 1);
  expect(findPath(ring, { x: 0, y: 0 }, { x: 20, y: 20 })).toBeNull();
  expect(findPath((x, y) => (x === 3 && y === 3 ? 0 : 1), { x: 0, y: 0 }, { x: 3, y: 3 })).toBeNull();
  expect(findPath(open, { x: 0, y: 0 }, { x: 100, y: 0 }, 64)).toBeNull();
});
test('desvia do vau quando o desvio é mais barato', () => {
  const ford = (x: number, y: number) => (x >= 4 && x <= 6 && y === 0 ? 2 : 1);
  const p = findPath(ford, { x: 0, y: 0 }, { x: 10, y: 0 })!;
  expect(p.filter(n => ford(n.x, n.y) === 2).length).toBe(0);
});
test('nearestWalkable', () => {
  const lake = (x: number, y: number) => (Math.max(Math.abs(x), Math.abs(y)) <= 5 ? 0 : 1);
  const n = nearestWalkable(lake, 0, 0)!;
  expect(Math.max(Math.abs(n.x), Math.abs(n.y))).toBe(6);
  expect(nearestWalkable(() => 0, 0, 0)).toBeNull();
  expect(nearestWalkable(open, 3, 4)).toEqual({ x: 3, y: 4 });
  // ilhota de 1 tile mais perto que a margem: deve ir para a margem (chão com vizinhos andáveis)
  const islet = (x: number, y: number) => ((x === 2 && y === 0) || x >= 8 ? 1 : 0);
  expect(nearestWalkable(islet, 0, 0)!.x).toBeGreaterThanOrEqual(8);
});
