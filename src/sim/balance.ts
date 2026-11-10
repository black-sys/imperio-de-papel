// Todos os números de jogo. Calibração inicial: ajustar aqui depois de jogar.
export type BuildingType = 'village' | 'sawmill' | 'quarry' | 'market' | 'garrison';
export type Res = { gold: number; wood: number; stone: number };

export const MONTH_SECONDS = 10; // a 1×
export const SPEEDS = [0, 1, 2, 4, 8] as const;
export const START_RES: Res = { gold: 40, wood: 110, stone: 60 };
export const TAX = 2;
export const CAPITAL_TAX = 10;
export const MAX_LEVEL = 3;
export const UPGRADE_COST = [0, 1, 1.8, 3]; // por nível
export const UPGRADE_TIME = 1.5; // multiplica o tempo a cada nível
export const MIN_FOREST = 0.3;
export const MIN_ROCK = 0.3;

export const BUILDINGS: Record<BuildingType, { name: string; cost: Res; months: number; yields: number[] }> = {
  village: { name: 'Vila', cost: { gold: 60, wood: 40, stone: 0 }, months: 3, yields: [0, 4, 7, 10] }, // ouro × fertilidade
  sawmill: { name: 'Serraria', cost: { gold: 40, wood: 20, stone: 10 }, months: 2, yields: [0, 3, 5, 8] }, // madeira × floresta
  quarry: { name: 'Pedreira', cost: { gold: 50, wood: 30, stone: 0 }, months: 3, yields: [0, 2, 4, 6] }, // pedra × rocha
  market: { name: 'Mercado', cost: { gold: 80, wood: 40, stone: 40 }, months: 4, yields: [0, 0.25, 0.4, 0.6] }, // % do ouro da província
  garrison: { name: 'Guarnição', cost: { gold: 60, wood: 40, stone: 60 }, months: 4, yields: [0, 0, 0, 0] },
};
export const GARRISON_UPKEEP = 2;

// custo cresce exponencialmente com as províncias que você já tem (barato no começo, caro no império grande)
// calibrado pelo teste de ritmo (jogador guloso): 1ª colonização ~4 meses, 20 províncias ~2 h a 1×
export const COLONIZE = { gold: 80, growth: 1.36, wood: 50, woodGrowth: 1.15, months: 5, hardExtra: 1, max: 2, garrisonDiscount: 0.25 };
