import { expect, test } from 'vitest';
import { formationSlots } from '../src/client/view/troops';

test.each([1, 7, 12, 20])('formação de %i soldados: posições distintas, espaçadas e centradas', n => {
  for (const facing of [0, 1.1]) {
    const slots = formationSlots(n, facing);
    expect(slots.length).toBe(n);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++)
      expect(Math.hypot(slots[i].x - slots[j].x, slots[i].z - slots[j].z)).toBeGreaterThan(0.89);
    if (n === 20) { // fileiras completas: centrada na tropa
      expect(Math.abs(slots.reduce((a, s) => a + s.x, 0) / n)).toBeLessThan(1e-9);
      expect(Math.abs(slots.reduce((a, s) => a + s.z, 0) / n)).toBeLessThan(1e-9);
    }
    expect(Math.max(...slots.map(s => Math.hypot(s.x, s.z)))).toBeLessThan(4);
  }
});
