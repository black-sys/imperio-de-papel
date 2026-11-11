import { expect, test } from 'vitest';
import { drawableFor, TileCache } from '../src/client/map/tileCache';
import { LEVELS } from '../src/client/map/view';

const TOP = LEVELS - 1;

/** fetch falso: cada pedido fica pendente até `finish(key)`. */
function fake() {
  const pending = new Map<string, (p: Uint8ClampedArray) => void>(), asked: string[] = [];
  const fetch = (L: number, x: number, y: number) => new Promise<Uint8ClampedArray>(res => { const k = `${L},${x},${y}`; asked.push(k); pending.set(k, res); });
  const finish = async (k: string) => { pending.get(k)?.(new Uint8ClampedArray(4)); pending.delete(k); await new Promise(r => setTimeout(r, 0)); };
  return { fetch, finish, asked, pending };
}
const toImage = async (p: Uint8ClampedArray) => ({ px: p }) as unknown as CanvasImageSource;
const T = (L: number, x: number, y: number) => ({ L, x, y });

test('não pede duplicado, respeita o limite em voo e troca a fila pela lista nova', async () => {
  const f = fake(), c = new TileCache(f.fetch, 10, 2, toImage);
  c.request([T(0, 1, 1), T(0, 1, 1), T(0, 2, 1), T(0, 3, 1)]);
  expect(f.asked).toEqual([`${TOP},0,0`, '0,1,1']); // primeiro o ancestral do continente
  c.request([T(0, 1, 1), T(0, 2, 1), T(0, 3, 1)]); // o renderizador repete a lista visível a cada quadro
  expect(f.asked.length).toBe(2);
  await f.finish('0,1,1');
  expect(f.asked).toEqual([`${TOP},0,0`, '0,1,1', '0,2,1']);
});

test('ao chegar: version sobe e get devolve', async () => {
  const f = fake(), c = new TileCache(f.fetch, 10, 6, toImage);
  c.request([T(2, 0, 0)]);
  expect(c.get(T(2, 0, 0))).toBeNull();
  const v = c.version;
  await f.finish('2,0,0');
  expect(c.version).toBe(v + 1);
  expect(c.get(T(2, 0, 0))).not.toBeNull();
});

test('LRU: o menos usado sai', async () => {
  const f = fake(), c = new TileCache(f.fetch, 3, 6, toImage);
  for (const x of [0, 1, 2]) { c.request([T(0, x, 0)]); await f.finish(`0,${x},0`); }
  c.get(T(0, 0, 0)); // 0 passa a ser o mais recente
  c.request([T(0, 3, 0)]); await f.finish('0,3,0');
  expect(c.get(T(0, 1, 0))).toBeNull();
  expect(c.get(T(0, 0, 0))).not.toBeNull();
  expect(c.get(T(0, 3, 0))).not.toBeNull();
});

test('clear durante o voo descarta a resposta antiga', async () => {
  const f = fake(), c = new TileCache(f.fetch, 10, 6, toImage);
  c.request([T(0, 5, 5)]);
  c.clear();
  const v = c.version;
  await f.finish('0,5,5');
  expect(c.get(T(0, 5, 5))).toBeNull();
  expect(c.version).toBe(v);
  c.request([T(0, 5, 5)]); // pode pedir de novo depois do clear
  expect(f.asked.filter(k => k === '0,5,5').length).toBe(2);
});

test('pedido que falha não trava a fila', async () => {
  let n = 0;
  const c = new TileCache(() => (n++ === 0 ? Promise.reject(new Error('x')) : Promise.resolve(new Uint8ClampedArray(4))), 10, 1, toImage);
  c.request([T(0, 0, 0), T(0, 1, 0)]);
  await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0));
  expect(c.get(T(0, 1, 0))).not.toBeNull();
});

test('drawableFor sobe para o nível acima', async () => {
  const f = fake(), c = new TileCache(f.fetch, 10, 6, toImage);
  expect(drawableFor(c, T(0, 5, 9))).toBeNull();
  c.request([T(1, 2, 4)]); await f.finish('1,2,4');
  expect(drawableFor(c, T(0, 5, 9))!.t).toEqual(T(1, 2, 4));
  c.request([T(0, 5, 9)]); await f.finish('0,5,9');
  expect(drawableFor(c, T(0, 5, 9))!.t).toEqual(T(0, 5, 9));
});

test('ladrilho que saiu da tela deixa de ser pedido', async () => {
  const f = fake(), c = new TileCache(f.fetch, 10, 1, toImage);
  c.request([T(0, 0, 0), T(0, 9, 9)]);
  c.request([T(0, 0, 0), T(0, 1, 0)]); // a vista mudou: 9,9 não interessa mais
  await f.finish(`${TOP},0,0`); await f.finish('0,0,0');
  expect(f.asked).toEqual([`${TOP},0,0`, '0,0,0', '0,1,0']);
});

test('nunca descarta um ladrilho da lista visível atual (telas grandes passam do limite)', async () => {
  const f = fake(), c = new TileCache(f.fetch, 3, 10, toImage), vis = [0, 1, 2, 3, 4].map(x => T(0, x, 0));
  c.request(vis);
  await f.finish(`${TOP},0,0`);
  for (const t of vis) await f.finish(`0,${t.x},0`);
  for (const t of vis) expect(c.get(t)).not.toBeNull();
  const v = c.version;
  c.request(vis); // quadro seguinte, mapa parado: nada a pedir de novo
  expect(f.pending.size).toBe(0);
  expect(c.version).toBe(v);
});

test('pede junto o ladrilho do continente (nível mais afastado) e nunca o descarta', async () => {
  const f = fake(), c = new TileCache(f.fetch, 2, 10, toImage);
  c.request([T(0, 5, 9)]);
  expect(f.asked).toContain(`${TOP},0,0`); // 5 >> 4 = 0, 9 >> 4 = 0
  await f.finish(`${TOP},0,0`); await f.finish('0,5,9');
  for (let x = 20; x < 30; x++) { c.request([T(0, x, 40)]); await f.finish(`0,${x},40`); await f.finish(`${TOP},1,2`); }
  expect(c.get(T(TOP, 0, 0))).not.toBeNull();
});
