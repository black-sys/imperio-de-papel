// Todos os números de jogo. Calibração inicial: ajustar aqui depois de jogar.
import type { VeinKind } from '../worldgen/provinces';

export type Res = { money: number; grain: number; wood: number; coal: number; iron: number; steel: number; arms: number };
export const RES_KEYS = ['money', 'grain', 'wood', 'coal', 'iron', 'steel', 'arms'] as const;
export const RES_NAMES: Record<keyof Res, string> = { money: 'dinheiro', grain: 'grãos', wood: 'madeira', coal: 'carvão', iron: 'ferro', steel: 'aço', arms: 'armas' };
export const zeroRes = (): Res => ({ money: 0, grain: 0, wood: 0, coal: 0, iron: 0, steel: 0, arms: 0 });

export const MONTH_SECONDS = 10; // a 1×
export const SPEEDS = [0, 1, 2, 4, 8] as const;
export const MAX_LEVEL = 3;
export const UPGRADE_COST = [0, 1, 1.8, 3]; // por nível
export const UPGRADE_TIME = 1.5; // multiplica o tempo a cada nível
export const QUOTA = 3; // prédios do mesmo tipo no nível anterior para subir (contando o próprio)

export type BuildingType = 'farm' | 'sawmill' | 'coal_mine' | 'iron_mine' | 'steelworks' | 'arms_factory' | 'market' | 'garrison';
/** `place`: veio (só o do recurso `vein`) ou lote junto da cidade. `out` por nível: produção/mês (× riqueza nos veios). `uses`: insumo por unidade. */
export const BUILDINGS: Record<BuildingType, { name: string; plural: string; place: 'vein' | 'lot'; vein?: VeinKind; product?: keyof Res; cost: Partial<Res>; months: number; out: number[]; uses?: Partial<Res> }> = {
  farm: { name: 'Fazenda', plural: 'Fazendas', place: 'vein', vein: 'grain', product: 'grain', cost: { money: 30, wood: 10 }, months: 2, out: [0, 4, 7, 10] },
  sawmill: { name: 'Serraria', plural: 'Serrarias', place: 'vein', vein: 'wood', product: 'wood', cost: { money: 30, wood: 10 }, months: 2, out: [0, 3, 5, 8] },
  coal_mine: { name: 'Mina de carvão', plural: 'Minas de carvão', place: 'vein', vein: 'coal', product: 'coal', cost: { money: 40, wood: 15 }, months: 3, out: [0, 2, 4, 6] },
  iron_mine: { name: 'Mina de ferro', plural: 'Minas de ferro', place: 'vein', vein: 'iron', product: 'iron', cost: { money: 40, wood: 15 }, months: 3, out: [0, 2, 4, 6] },
  steelworks: { name: 'Siderúrgica', plural: 'Siderúrgicas', place: 'lot', product: 'steel', cost: { money: 60, wood: 20, iron: 10 }, months: 4, out: [0, 2, 4, 6], uses: { iron: 2, coal: 2 } },
  arms_factory: { name: 'Fábrica de armas', plural: 'Fábricas de armas', place: 'lot', product: 'arms', cost: { money: 60, wood: 20, steel: 10 }, months: 4, out: [0, 2, 4, 6], uses: { steel: 1, wood: 1 } },
  market: { name: 'Mercado', plural: 'Mercados', place: 'lot', cost: { money: 50, wood: 20 }, months: 3, out: [0, 0.25, 0.4, 0.6] }, // % dos impostos da cidade
  garrison: { name: 'Guarnição', plural: 'Guarnições', place: 'lot', cost: { money: 60, wood: 30, iron: 10 }, months: 4, out: [0, 0, 0, 0] },
};
export const GARRISON_UPKEEP = 2; // dinheiro/mês
export const STEEL_ON_N3 = 10; // aço extra em toda melhoria para o nível 3

/** Cidade por nível (índice = nível). */
export const CITY = {
  tax: [0, 4, 8, 14], // × fertilidade
  grain: [0, 1, 2, 4],
  lots: [0, 1, 2, 4],
  cost: [{}, {}, { money: 80, wood: 40, iron: 20 }, { money: 200, iron: 60, steel: 30 }] as Partial<Res>[],
  months: [0, 0, 4, 8],
  capitalTax: 10,
};
export const GRAIN_SHORT_TAX = 0.5; // impostos no mês seguinte a ficar sem grãos
export const STALL_WARN_MONTHS = 6; // no máximo um aviso de fábrica parada por lote neste intervalo
// estoque inicial = base × riqueza média dos veios do recurso no território da capital (piso 0.5); dinheiro × fertilidade
export const START_BASE: Res = { money: 60, grain: 40, wood: 80, coal: 20, iron: 40, steel: 0, arms: 20 };
export const START_NO_VEIN = 0.5;

export type TroopType = 'line' | 'artillery' | 'cavalry';
/** `level` = nível de Guarnição que libera o tipo; `speed` em tiles por mês. */
export const TROOPS: Record<TroopType, { name: string; level: number; soldiers: number; attack: number; defense: number; speed: number; cost: Partial<Res>; upkeep: Partial<Res>; months: number }> = {
  line: { name: 'Infantaria de linha', level: 1, soldiers: 20, attack: 1.0, defense: 1.2, speed: 150, cost: { money: 30, grain: 10, arms: 10 }, upkeep: { money: 1, grain: 1 }, months: 2 },
  artillery: { name: 'Artilharia', level: 2, soldiers: 12, attack: 1.4, defense: 0.6, speed: 100, cost: { money: 50, arms: 15, steel: 10 }, upkeep: { money: 1.5 }, months: 3 },
  cavalry: { name: 'Cavalaria', level: 3, soldiers: 12, attack: 1.6, defense: 1.0, speed: 240, cost: { money: 70, grain: 10, arms: 10, iron: 10 }, upkeep: { money: 2, grain: 1.5 }, months: 3 },
};
export const BATTLE = {
  step: 0.02, // passo fixo da simulação de tropas (meses)
  formation: 10, // tiles entre tropas em formação
  contact: 6, join: 20, // tiles: distância que começa a batalha; raio em que as tropas entram nela
  rate: 1.3, // dano por soldado por mês (calibra a duração: lanceiros iguais ≈ 0.5 mês, com a abertura)
  openingFire: 0.1, // meses iniciais em que só a artilharia causa dano
  counter: 1.5, // infantaria → cavalaria, cavalaria → artilharia, artilharia → infantaria
  cover: 1.25, river: 0.75, fortress: 1.5, // defesa em floresta/colina; dano de quem está no rio; defesa de fortaleza
  moraleLoss: 2, breakAt: 0.3, // moral = 1 − moraleLoss × fração perdida; abaixo de breakAt o lado foge (35% de baixas)
  rout: 0.5, // meses em fuga, sem obedecer
  minSoldiers: 3, // abaixo disso a tropa se dispersa
};
// fração das províncias com fortaleza; meses sem combate para recompor; tropas = 2 × (saltos até a capital sugerida − 1), até `max`
// calibrado pelo teste de ritmo: com 1–4 tropas a 1ª fortaleza caía em ~55 meses e 11–15 delas em 100 meses
export const FORTRESS = { share: 0.25, regenMonths: 3, max: 10 };
export const REFILL = { rate: 1, garrisonRate: 3, money: 2 }; // soldados/mês parado no reino (com Guarnição na província); dinheiro por soldado
// cada tropa a mais (viva ou em treino) encarece a próxima, como a colonização: freia a conquista quando o ouro sobra
// calibrado pelo teste de ritmo: 1.6 dá a 1ª fortaleza em 100–235 meses e 20 províncias em 390–480; com 2 a 1ª passa de 350
export const TROOP_GROWTH = 1.6;
export const TROOP_CAP = [0, 2, 3, 4]; // tropas sustentadas por nível de Guarnição

// custo cresce exponencialmente com as províncias que você já tem (barato no começo, caro no império grande)
// calibrado pelo teste de ritmo (jogador guloso): 1ª colonização ~4 meses, 20 províncias ~2 h a 1×
export const COLONIZE = { money: 80, growth: 1.36, wood: 50, woodGrowth: 1.15, months: 5, hardExtra: 1, max: 2, garrisonDiscount: 0.25 };
