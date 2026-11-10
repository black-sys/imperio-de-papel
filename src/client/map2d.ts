import { Biome } from '../worldgen/types';

export const BIOME_COLORS: Record<Biome, [number, number, number]> = {
  [Biome.Ocean]: [58, 104, 168],
  [Biome.Beach]: [222, 206, 150],
  [Biome.Snow]: [236, 238, 242],
  [Biome.Taiga]: [62, 104, 78],
  [Biome.TemperateForest]: [72, 134, 64],
  [Biome.Grassland]: [138, 182, 86],
  [Biome.Swamp]: [86, 110, 76],
  [Biome.Savanna]: [196, 180, 96],
  [Biome.Desert]: [226, 198, 132],
  [Biome.Jungle]: [36, 118, 54],
  [Biome.Mountain]: [128, 120, 114],
};
export const BIOME_NAMES: Record<Biome, string> = {
  [Biome.Ocean]: 'Água', [Biome.Beach]: 'Praia', [Biome.Snow]: 'Neve / tundra', [Biome.Taiga]: 'Taiga',
  [Biome.TemperateForest]: 'Floresta temperada', [Biome.Grassland]: 'Campo', [Biome.Swamp]: 'Pântano',
  [Biome.Savanna]: 'Savana', [Biome.Desert]: 'Deserto', [Biome.Jungle]: 'Selva', [Biome.Mountain]: 'Montanha',
};
