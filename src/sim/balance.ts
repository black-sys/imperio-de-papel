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

export type TroopType = 'spear' | 'archer' | 'cavalry';
/** `level` = nível de Guarnição que libera o tipo; `speed` em tiles por mês. */
export const TROOPS: Record<TroopType, { name: string; level: number; soldiers: number; attack: number; defense: number; speed: number; cost: Res; upkeep: number; months: number }> = {
  spear: { name: 'Lanceiros', level: 1, soldiers: 20, attack: 1.0, defense: 1.2, speed: 150, cost: { gold: 40, wood: 20, stone: 0 }, upkeep: 1, months: 2 },
  archer: { name: 'Arqueiros', level: 2, soldiers: 15, attack: 1.0, defense: 0.6, speed: 150, cost: { gold: 50, wood: 40, stone: 0 }, upkeep: 1.5, months: 2 },
  cavalry: { name: 'Cavaleiros', level: 3, soldiers: 12, attack: 1.6, defense: 1.0, speed: 240, cost: { gold: 90, wood: 20, stone: 20 }, upkeep: 3, months: 3 },
};
export const BATTLE = {
  step: 0.02, // passo fixo da simulação de tropas (meses)
  formation: 10, // tiles entre tropas em formação
  contact: 6, join: 20, // tiles: distância que começa a batalha; raio em que as tropas entram nela
  rate: 1.3, // dano por soldado por mês (calibra a duração: lanceiros iguais ≈ 0.5 mês, com a abertura)
  archerOpening: 0.1, // meses iniciais em que só arqueiros causam dano
  counter: 1.5, // lanceiros → cavaleiros, cavaleiros → arqueiros
  cover: 1.25, river: 0.75, fortress: 1.5, // defesa em floresta/colina; dano de quem está no rio; defesa de fortaleza
  moraleLoss: 2, breakAt: 0.3, // moral = 1 − moraleLoss × fração perdida; abaixo de breakAt o lado foge (35% de baixas)
  rout: 0.5, // meses em fuga, sem obedecer
  minSoldiers: 3, // abaixo disso a tropa se dispersa
};
// fração das províncias com fortaleza; meses sem combate para recompor; tropas = 2 × (saltos até a capital sugerida − 1), até `max`
// calibrado pelo teste de ritmo: com 1–4 tropas a 1ª fortaleza caía em ~55 meses e 11–15 delas em 100 meses
export const FORTRESS = { share: 0.25, regenMonths: 3, max: 10 };
export const REFILL = { rate: 1, garrisonRate: 3, gold: 2 }; // soldados/mês parado no reino (com Guarnição na província); ouro por soldado
export const TROOP_CAP = [0, 2, 3, 4]; // tropas sustentadas por nível de Guarnição
export const GARRISON_GOAL = [0, 0, 3, 3]; // por nível alvo: guarnições do reino no nível anterior ou maior (contando a própria)

// custo cresce exponencialmente com as províncias que você já tem (barato no começo, caro no império grande)
// calibrado pelo teste de ritmo (jogador guloso): 1ª colonização ~4 meses, 20 províncias ~2 h a 1×
export const COLONIZE = { gold: 80, growth: 1.36, wood: 50, woodGrowth: 1.15, months: 5, hardExtra: 1, max: 2, garrisonDiscount: 0.25 };
