// estado mínimo à mão (sem gerar mundo)
import { expect, test } from 'vitest';
import { MODES, MODE_LEGEND, provinceFill } from '../src/client/map/modes';
import { REALM_COLORS } from '../src/client/map/pick';
import type { GameState } from '../src/sim/state';

const s = {
  owner: [0, 0, 1, -1], stability: [70, 10, 50, 0], connected: [true, false, false, false],
  nations: [{ id: 0, alive: true }, { id: 1, alive: true }], relations: [[0, -60], [-60, 0]], city: [{}, {}, {}, null],
} as unknown as GameState;

test('político: cor da nação; neutra sem cor', () => {
  expect(provinceFill(s, 2, 'political')).toBe(REALM_COLORS[1]);
  expect(provinceFill(s, 3, 'political')).toBeNull();
});
test('estabilidade pelas faixas', () => {
  expect(provinceFill(s, 0, 'stability')).toBe('#4f7a3a');
  expect(provinceFill(s, 1, 'stability')).toBe('#b3261e');
  expect(provinceFill(s, 2, 'stability')).toBe('#c9a227');
});
test('rede: só as suas, ligada ou não', () => {
  expect(provinceFill(s, 0, 'network')).toBe('#4f7a3a');
  expect(provinceFill(s, 1, 'network')).toBe('#b3261e');
  expect(provinceFill(s, 2, 'network')).toBeNull();
});
test('diplomacia pela relação com você', () => {
  expect(provinceFill(s, 2, 'diplomacy')).toBe('#b3261e');
  expect(provinceFill(s, 0, 'diplomacy')).toBe('#f7d774');
});
test('sem nações (antes da capital) nada quebra', () => {
  const empty = { ...s, nations: [], owner: [-1, -1, -1, -1] } as unknown as GameState;
  for (const m of MODES) expect(provinceFill(empty, 0, m)).toBeNull();
});
test('toda legenda tem entradas, menos a política', () => {
  for (const m of MODES) if (m !== 'political') expect(MODE_LEGEND[m].length).toBeGreaterThan(0);
});
