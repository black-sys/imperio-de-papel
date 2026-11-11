import { expect, test } from 'vitest';
import { markersKey } from '../src/client/map/markers';
import { REALM_COLORS, cityAt, pickAt, provinceAtTile, routeTargetAt, armiesInRect } from '../src/client/map/pick';
import { toScreen, type View } from '../src/client/map/view';
import { addFortress } from '../src/sim/fortress';
import { spawnArmy } from '../src/sim/armies';
import { game, world } from './troopworld';

const { pm } = world;
const view: View = { cx: 128, cy: 128, scale: 2.5, w: 700, h: 700 };
const scr = (x: number, y: number) => toScreen(view, x, y);
const opts = () => ({ selectedArmies: new Set<number>(), selectedProvince: -1, pins: [], grid: world.grid });

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
  const t = spawnArmy(s, 0, ['line'], 60, 80);
  expect(pickAt(s, pm, view, ...scr(60, 80))).toEqual({ kind: 'army', id: t.id });
  // borda do retângulo da tropa (30×20 px + folga): 13 px à direita do centro ainda é a tropa
  const [sx, sy] = scr(60, 80);
  expect(pickAt(s, pm, view, sx + 13, sy)).toEqual({ kind: 'army', id: t.id });
  s.armies = [];
  expect(pickAt(s, pm, view, ...scr(60, 80))).toEqual({ kind: 'city', province: 0 });
  addFortress(s, pm, 1, ['line']);
  s.armies = []; // só o marcador da fortaleza conta aqui
  expect(pickAt(s, pm, view, ...scr(180, 80))).toEqual({ kind: 'fortress', province: 1 });
  expect(pickAt(s, pm, view, ...scr(20, 150))).toEqual({ kind: 'province', province: 0 });
  expect(pickAt(s, pm, { ...view, cx: -500 }, 10, 10)).toBeNull();
});

test('tropas de fortaleza não são escolhidas como tropa do jogador', () => {
  const s = game();
  addFortress(s, pm, 1, ['line']);
  const f = s.armies.find(t => t.owner === -1)!;
  expect(pickAt(s, pm, view, ...scr(f.x, f.y))).toEqual({ kind: 'fortress', province: 1 });
});

test('armiesInRect pega só as do jogador dentro', () => {
  const s = game(), a = spawnArmy(s, 0, ['line'], 100, 100), b = spawnArmy(s, 0, ['line'], 200, 200);
  spawnArmy(s, -1, ['line'], 105, 105, 1);
  const [x0, y0] = scr(90, 90), [x1, y1] = scr(120, 120);
  expect(armiesInRect(s, view, x0, y0, x1, y1)).toEqual([a.id]);
  expect(armiesInRect(s, view, x1, y1, x0, y0)).toEqual([a.id]); // caixa arrastada ao contrário
  expect(b.id).toBeGreaterThan(0);
});

test('markersKey: muda só com o que aparece', () => {
  const s = game(), t = spawnArmy(s, 0, ['line'], 100, 100), o = opts();
  const k0 = markersKey(s, pm, view, o);
  expect(markersKey(s, pm, view, o)).toBe(k0);
  t.x += 0.12; // 0,3 px de tela
  expect(markersKey(s, pm, view, o)).toBe(k0);
  t.x += 0.4; // agora passa de 1 px no total (1,3 px)
  expect(markersKey(s, pm, view, o)).not.toBe(k0);
  const k1 = markersKey(s, pm, view, o);
  o.selectedArmies.add(t.id);
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

test('lote e veio são alvos de clique (tropa > cidade > lote > veio > fortaleza > província)', () => {
  const s = game(); // lote 0 da província 0 em (60, 100); veio 0 (grãos) em (20, 40)
  expect(pickAt(s, pm, view, ...scr(60, 100))).toEqual({ kind: 'lot', province: 0, lot: 0 });
  expect(pickAt(s, pm, view, ...scr(20, 40))).toEqual({ kind: 'vein', province: 0, vein: 0 });
  const t = spawnArmy(s, 0, ['line'], 60, 100);
  expect(pickAt(s, pm, view, ...scr(60, 100))).toEqual({ kind: 'army', id: t.id });
  // veio de província neutra também abre o painel dela
  expect(pickAt(s, pm, view, ...scr(140, 40))).toEqual({ kind: 'vein', province: 1, vein: 0 });
});

test('markersKey muda quando um veio ou lote recebe prédio', () => {
  const s = game(), o = opts(), k0 = markersKey(s, pm, view, o);
  s.veins[0][0] = { type: 'farm', level: 1, remaining: 2 };
  const k1 = markersKey(s, pm, view, o);
  expect(k1).not.toBe(k0);
  s.lots[0][0] = { type: 'steelworks', level: 1, remaining: 4 };
  expect(markersKey(s, pm, view, o)).not.toBe(k1);
});

test('markersKey muda com rota construída, pronta, cortada e linha de suprimento', () => {
  const s = game(1, true), o = opts(), k0 = markersKey(s, pm, view, o);
  expect(markersKey(s, pm, view, o)).toBe(k0);
  s.routes[0].remaining = 2; // em obra
  const k1 = markersKey(s, pm, view, o);
  expect(k1).not.toBe(k0);
  s.routes[0].remaining = 0; s.routes[0].cut = true;
  const k2 = markersKey(s, pm, view, o);
  expect(k2).not.toBe(k1);
  s.connected[1] = false;
  const k3 = markersKey(s, pm, view, o);
  expect(k3).not.toBe(k2);
  const t = spawnArmy(s, 0, ['line'], 100, 100);
  const k4 = markersKey(s, pm, view, o);
  t.supply = { path: [10, 11], from: 0, at: 0, cut: false };
  expect(markersKey(s, pm, view, o)).not.toBe(k4);
});

test('no modo de traçar rota, o alvo é a província sob o ponteiro, mesmo com tropa em cima da cidade', () => {
  const s = game();
  spawnArmy(s, 0, ['line'], 60, 80); // em cima da cidade da província 0
  expect(pickAt(s, pm, view, ...scr(60, 80))?.kind).toBe('army');
  expect(routeTargetAt(pm, view, ...scr(60, 80))).toBe(0);
  expect(routeTargetAt(pm, { ...view, cx: -900 }, 10, 10)).toBe(-1);
});

test('markersKey muda quando entra ou sai batalhão e quando a peça se abre com o zoom', () => {
  const s = game(), o = opts(), a = spawnArmy(s, 0, ['line'], 100, 100), k0 = markersKey(s, pm, view, o);
  a.battalions.push({ type: 'artillery', soldiers: 12 });
  const k1 = markersKey(s, pm, view, o);
  expect(k1).not.toBe(k0);
  a.battalions.shift();
  expect(markersKey(s, pm, view, o)).not.toBe(k1);
  const near = { ...view, scale: 5 }, far = { ...view, scale: 3.9 };
  expect(markersKey(s, pm, near, o).includes('open')).toBe(true);
  expect(markersKey(s, pm, far, o).includes('open')).toBe(false);
});

test('nações: exército de rival se acha no clique (só leitura) mas não entra na caixa', () => {
  const s = game(), r = spawnArmy(s, 1, ['line'], 100, 100), [x, y] = toScreen(view, 100, 100);
  expect(pickAt(s, pm, view, x, y, false)).toEqual({ kind: 'army', id: r.id });
  expect(pickAt(s, pm, view, x, y)).not.toEqual({ kind: 'army', id: r.id });
  expect(armiesInRect(s, view, x - 30, y - 30, x + 30, y + 30)).toEqual([]);
});

test('markersKey muda quando a ocupação avança 0.1 mês e quando a província muda de dono', () => {
  const s = game(), o = opts();
  s.occupations.push({ province: 1, nation: 1, progress: 0.2 });
  const k0 = markersKey(s, pm, view, o);
  s.occupations[0].progress = 0.21;
  expect(markersKey(s, pm, view, o)).toBe(k0);
  s.occupations[0].progress = 0.31;
  expect(markersKey(s, pm, view, o)).not.toBe(k0);
  const k1 = markersKey(s, pm, view, o);
  s.owner[1] = 1;
  expect(markersKey(s, pm, view, o)).not.toBe(k1);
});

test('cores das nações: uma por nação na paleta da carta', () => {
  expect(REALM_COLORS).toEqual(['#a8342a', '#2f4f7f', '#2f5d3a', '#b0802a', '#6a3f7a']);
});
