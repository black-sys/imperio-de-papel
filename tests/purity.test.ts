import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';

const files = (d: string): string[] =>
  readdirSync(d).flatMap(f => (statSync(join(d, f)).isDirectory() ? files(join(d, f)) : [join(d, f)]));

test('worldgen não usa aleatoriedade, transcendentais nem DOM/three', () => {
  const bad = /Math\.(random|sin|cos|tan|exp|pow|log|atan2)\b|from ['"](three|.*client)|\bwindow\.|\bdocument\./;
  const offenders = files('src/worldgen').filter(f => f.endsWith('.ts') && bad.test(readFileSync(f, 'utf8')));
  expect(offenders).toEqual([]);
  expect(files('src/worldgen').length).toBeGreaterThan(0);
});
