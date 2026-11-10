import { expect, test } from 'vitest';
import { windMoisture } from '../src/worldgen/global/moisture';

const S = 64;
const elev = new Float32Array(S * S), land = new Uint8Array(S * S);
for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
  const i = y * S + x;
  land[i] = x >= 10 ? 1 : 0;
  elev[i] = x < 10 ? 0.2 : x >= 30 && x <= 33 ? 0.9 : 0.45;
}
const m = windMoisture(S, elev, land, 1);
const avg = (x0: number, x1: number) => {
  let s = 0, n = 0;
  for (let y = 0; y < S; y++) for (let x = x0; x <= x1; x++) { s += m[y * S + x]; n++; }
  return s / n;
};
test('sombra de chuva: oeste da crista mais úmido que leste', () => expect(avg(20, 29)).toBeGreaterThan(avg(36, 45) + 0.15));
test('saída em [0,1]', () => expect(m.every(v => v >= 0 && v <= 1)).toBe(true));
test('oceano úmido', () => expect(avg(0, 7)).toBeGreaterThanOrEqual(0.9));
