import { expect, test } from 'vitest';
import { hashArrays, makeRng, subSeed } from '../src/worldgen/rng';
import { parseSeed } from '../src/worldgen/seed';

test('makeRng é determinístico e em [0,1)', () => {
  const a = makeRng(860), b = makeRng(860);
  const xs = Array.from({ length: 1000 }, a);
  expect(xs).toEqual(Array.from({ length: 1000 }, b));
  expect(xs.every(x => x >= 0 && x < 1)).toBe(true);
  expect(makeRng(861)()).not.toBe(xs[0]);
});
test('subSeed difere por rótulo e é estável', () => {
  expect(subSeed(860, 'rios')).toBe(subSeed(860, 'rios'));
  expect(subSeed(860, 'rios')).not.toBe(subSeed(860, 'placas'));
});
test('hashArrays muda com um byte', () => {
  expect(hashArrays(new Uint8Array([1, 2, 3]))).not.toBe(hashArrays(new Uint8Array([1, 2, 4])));
});
test.each([['123', 123], ['0', 0], ['4294967295', 4294967295]])('parseSeed(%s)', (s, v) => expect(parseSeed(s)).toBe(v));
test.each([null, '', 'abc', '-5', '1.5', '4294967296', '12abc'])('parseSeed inválido %s', s => expect(parseSeed(s)).toBeNull());
