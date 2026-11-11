import { expect, test } from 'vitest';
import { markersKey } from '../src/client/map/markers';
import { cityAt, pickAt, provinceAtTile, troopsInRect } from '../src/client/map/pick';
import { toScreen, type View } from '../src/client/map/view';
import { addFortress } from '../src/sim/fortress';
import { spawnTroop } from '../src/sim/troops';
import { game, world } from './troopworld';

const { pm } = world;
const view: View = { cx: 128, cy: 128, scale: 2, w: 600, h: 600 };
const scr = (x: number, y: number) => toScreen(view, x, y);
const opts = () => ({ selectedTroops: new Set<number>(), selectedProvince: -1, pins: [], grid: world.grid });

test('provinceAtTile usa o tamanho da grade do mapa', () => {
  expect(provinceAtTile(pm, 10, 10)).toBe(0);
  expect(provinceAtTile(pm, 200, 10)).toBe(1);
  expect(provinceAtTile(pm, -1, 10)).toBe(-1);
  expect(provinceAtTile(pm, 300, 10)).toBe(-1);
});

test('prioridade: tropa > cidade > fortaleza > província', () => {
  const s = game(); // capital na província 0: vila na vaga 0 (60, 80)
  const city = cityAt(s, pm, 0)!;
  expect(city).toEqual({ x: 60, y: 80 });
  const t = spawnTroop(s, 0, 'line', 60, 80);
  expect(pickAt(s, pm, view, ...scr(60, 80))).toEqual({ kind: 'troop', id: t.id });
  // borda do retângulo da tropa (30×20 px + folga): 13 px à direita do centro ainda é a tropa
  const [sx, sy] = scr(60, 80);
  expect(pickAt(s, pm, view, sx + 13, sy)).toEqual({ kind: 'troop', id: t.id });
  s.troops = [];
  expect(pickAt(s, pm, view, ...scr(60, 80))).toEqual({ kind: 'city', province: 0 });
  addFortress(s, pm, 1, ['line']);
  s.troops = []; // só o marcador da fortaleza conta aqui
  expect(pickAt(s, pm, view, ...scr(180, 80))).toEqual({ kind: 'fortress', province: 1 });
  expect(pickAt(s, pm, view, ...scr(20, 200))).toEqual({ kind: 'province', province: 0 });
  expect(pickAt(s, pm, { ...view, cx: -500 }, 10, 10)).toBeNull();
});

test('tropas de fortaleza não são escolhidas como tropa do jogador', () => {
  const s = game();
  addFortress(s, pm, 1, ['line']);
  const f = s.troops.find(t => t.owner === -1)!;
  expect(pickAt(s, pm, view, ...scr(f.x, f.y))).toEqual({ kind: 'fortress', province: 1 });
});

test('troopsInRect pega só as do jogador dentro', () => {
  const s = game(), a = spawnTroop(s, 0, 'line', 100, 100), b = spawnTroop(s, 0, 'line', 200, 200);
  spawnTroop(s, -1, 'line', 105, 105, 1);
  const [x0, y0] = scr(90, 90), [x1, y1] = scr(120, 120);
  expect(troopsInRect(s, view, x0, y0, x1, y1)).toEqual([a.id]);
  expect(troopsInRect(s, view, x1, y1, x0, y0)).toEqual([a.id]); // caixa arrastada ao contrário
  expect(b.id).toBeGreaterThan(0);
});

test('markersKey: muda só com o que aparece', () => {
  const s = game(), t = spawnTroop(s, 0, 'line', 100, 100), o = opts();
  const k0 = markersKey(s, pm, view, o);
  expect(markersKey(s, pm, view, o)).toBe(k0);
  t.x += 0.2; // 0,4 px de tela
  expect(markersKey(s, pm, view, o)).toBe(k0);
  t.x += 0.4; // agora passa de 1 px no total
  expect(markersKey(s, pm, view, o)).not.toBe(k0);
  const k1 = markersKey(s, pm, view, o);
  o.selectedTroops.add(t.id);
  expect(markersKey(s, pm, view, o)).not.toBe(k1);
  const k2 = markersKey(s, pm, view, o);
  t.x = 5000; // fora da tela: andar lá não importa
  const k3 = markersKey(s, pm, view, o);
  t.x = 5050;
  expect(markersKey(s, pm, view, o)).toBe(k3);
  expect(k3).not.toBe(k2);
});

test('selo da capital sugerida é alvo de clique, mesmo com o centro fora da província', () => {
  const s = game();
  const pins = [{ x: 30, y: 30, province: 1 }]; // centro desenhado na província 0, mas o selo é da 1
  const [sx, sy] = scr(30, 30);
  expect(pickAt(s, pm, view, sx + 8, sy, true, pins)).toEqual({ kind: 'province', province: 1 });
  expect(pickAt(s, pm, view, sx + 30, sy, true, pins)).toEqual({ kind: 'province', province: 0 });
});
