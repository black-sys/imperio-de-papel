import { expect, test } from 'vitest';
import { classifyBiome, temperatureMap } from '../src/worldgen/global/biomes';
import { Biome } from '../src/worldgen/types';

// classifyBiome(elev, t, m, water, coastal, slope)
test.each([
  ['oceano', [0.3, 0.5, 0.5, 1, false, 0], Biome.Ocean],
  ['lago', [0.45, 0.5, 0.5, 2, false, 0], Biome.Ocean],
  ['praia', [0.41, 0.5, 0.5, 0, true, 0], Biome.Beach],
  ['montanha', [0.8, 0.5, 0.5, 0, false, 0], Biome.Mountain],
  ['pico nevado', [0.8, 0.1, 0.5, 0, false, 0], Biome.Snow],
  ['neve', [0.5, 0.1, 0.5, 0, false, 0], Biome.Snow],
  ['taiga', [0.5, 0.25, 0.6, 0, false, 0], Biome.Taiga],
  ['estepe fria', [0.5, 0.25, 0.3, 0, false, 0], Biome.Grassland],
  ['campo', [0.5, 0.5, 0.1, 0, false, 0], Biome.Grassland],
  ['floresta', [0.5, 0.5, 0.5, 0, false, 0.01], Biome.TemperateForest],
  ['pântano', [0.5, 0.5, 0.9, 0, false, 0.001], Biome.Swamp],
  ['floresta úmida inclinada', [0.5, 0.5, 0.9, 0, false, 0.01], Biome.TemperateForest],
  ['deserto', [0.5, 0.9, 0.1, 0, false, 0.01], Biome.Desert],
  ['savana', [0.5, 0.9, 0.3, 0, false, 0.01], Biome.Savanna],
  ['campo quente', [0.5, 0.9, 0.6, 0, false, 0.01], Biome.Grassland],
  ['selva', [0.5, 0.9, 0.9, 0, false, 0.01], Biome.Jungle],
] as const)('%s', (_, args, expected) => expect(classifyBiome(...(args as unknown as Parameters<typeof classifyBiome>))).toBe(expected));

test('norte mais frio que o sul', () => {
  const S = 64, elev = new Float32Array(S * S).fill(0.45);
  const t = temperatureMap(S, elev, 1);
  const row = (y: number) => t.slice(y * S, y * S + S).reduce((a, v) => a + v, 0) / S;
  expect(row(0)).toBeLessThan(row(S - 1));
  expect(t.every(v => v >= 0 && v <= 1)).toBe(true);
});
