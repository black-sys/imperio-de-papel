import { describe, expect, test } from 'vitest';
import { runsOutIn, sparkline, trend } from '../src/client/ledger';

describe('livro de contas: funções puras', () => {
  test('tendência: sobe, cai, estável', () => {
    expect(trend(2)).toBe('▲');
    expect(trend(-0.5)).toBe('▼');
    expect(trend(0.01)).toBe('▬');
  });
  test('acaba em N meses só com saldo negativo', () => {
    expect(runsOutIn(30, -4)).toBe(8);
    expect(runsOutIn(30, 4)).toBeNull();
    expect(runsOutIn(0, -1)).toBe(0);
  });
  test('gráfico: pontos dentro da caixa, projeção tracejada', () => {
    const svg = sparkline([10, 20, 15, 30], -5, 160, 36);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('stroke-dasharray');
    const nums = [...svg.matchAll(/points="([^"]+)"/g)].flatMap(m => m[1].trim().split(/[ ,]/).map(Number));
    expect(nums.length).toBeGreaterThan(0);
    for (let i = 0; i < nums.length; i += 2) {
      expect(nums[i]).toBeGreaterThanOrEqual(0); expect(nums[i]).toBeLessThanOrEqual(160);
      expect(nums[i + 1]).toBeGreaterThanOrEqual(0); expect(nums[i + 1]).toBeLessThanOrEqual(36);
    }
    expect(sparkline([], 0, 160, 36)).toContain('<svg'); // sem histórico ainda
  });
});
