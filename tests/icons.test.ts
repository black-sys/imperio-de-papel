import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { ICON_PATHS, icon } from '../src/client/icons';
import { costText } from '../src/client/labels';
import { RES_KEYS } from '../src/sim/balance';

const files = (d: string): string[] => readdirSync(d).flatMap(f => statSync(join(d, f)).isDirectory() ? files(join(d, f)) : f.endsWith('.ts') ? [join(d, f)] : []);

test('todo recurso e tropa tem ícone', () => {
  for (const k of [...RES_KEYS, 'line', 'artillery', 'cavalry'] as const) expect(ICON_PATHS[k]).toMatch(/^M/);
  expect(icon('money')).toContain(`d="${ICON_PATHS.money}"`);
});
test('custo em texto não leva markup', () => {
  expect(costText({ money: 30, wood: 10, months: 2 }, 'text')).toBe('30 dinheiro, 10 madeira · 2 meses');
  expect(costText({ money: 30 })).toContain('<svg');
});
test('nenhum emoji no código da interface', () => {
  const hits = [...files('src'), 'index.html'].filter(f => /\p{Extended_Pictographic}/u.test(readFileSync(f, 'utf8')));
  expect(hits).toEqual([]);
});
