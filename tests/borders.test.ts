import { expect, test } from 'vitest';
import { makePainter } from '../src/client/view/borders';
import { generateWorld } from '../src/worldgen/global/world';
import { generateProvinces } from '../src/worldgen/provinces';

const pm = generateProvinces(generateWorld(860));
const p = pm.provinces[pm.suggestedCapitals[0]];
const owner = pm.provinces.map(() => -1);
owner[p.id] = 0;

test('tinta: dona no interior, fronteira na borda, neutra sem tinta, selecionada clara', { timeout: 60000 }, () => {
  const paint = makePainter(pm, owner, -1), sel = makePainter(pm, owner, p.id);
  const c = p.center;
  expect(paint(c.x, c.y, 1)).toEqual([1.12, 0.88, 0.84]);
  expect(sel(c.x, c.y, 1)).toEqual([1.18, 1.15, 1.05]);
  const other = pm.provinces.find(q => q.id !== p.id && owner[q.id] === -1 && q.neighbors.length > 2)!;
  expect(paint(other.center.x, other.center.y, 1)).toBeNull();
  // caminha do centro até sair da província: o último tile dentro é fronteira
  let x = c.x;
  const S = 4096 / 4;
  while (pm.cellProvince[Math.floor(c.y / 4) * S + Math.floor((x + 1) / 4)] === p.id) x++;
  expect(paint(x, c.y, 1)).toEqual([0.85, 0.35, 0.28]);
  expect(paint(x, c.y, 4)).toEqual([1.12, 0.88, 0.84]); // L2 não desenha fronteira
});
