export enum Biome { Ocean = 0, Beach, Snow, Taiga, TemperateForest, Grassland, Swamp, Savanna, Desert, Jungle, Mountain }
export const BIOME_COUNT = 11;

export interface River {
  points: Float32Array; // pares x,y em tiles
  flow: Float32Array;
  surface: Float32Array; // elevação 0..1 por ponto
}

/** Mapa global GLOBAL_SIZE², índices y*size+x. */
export interface WorldMap {
  seed: number;
  size: number;
  elevation: Float32Array;
  filled: Float32Array;
  water: Uint8Array; // 0 terra, 1 oceano, 2 lago
  lakeSurface: Float32Array;
  flow: Float32Array;
  river: Uint8Array;
  temperature: Float32Array;
  moisture: Float32Array;
  biome: Uint8Array;
  rivers: River[];
  spawn: { x: number; y: number }; // tiles
}

export type ResourceKind = 'pine' | 'tree' | 'cactus' | 'rock';
export interface Resource { id: string; kind: ResourceKind; x: number; y: number }

/** Chunk CHUNK² tiles; heights (CHUNK+1)² vértices. */
export interface ChunkData {
  cx: number;
  cy: number;
  heights: Float32Array;
  biome: Uint8Array;
  water: Uint8Array; // 0 seco, 1 oceano, 2 lago, 3 rio
  waterLevel: Float32Array;
  riverWidth: Float32Array;
  walk: Uint8Array; // 0 bloqueado, 1 normal, 2 lento
  resources: Resource[];
}
