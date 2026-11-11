import type { ProvinceMap } from '../worldgen/provinces';
import { HEADLINES, STAB } from './balance';
import { activeLevel, cityLevel, type GameState } from './state';

/** Grava uma manchete no jornal (as últimas HEADLINES). */
export function headline(s: GameState, text: string): void {
  s.headlines.push({ month: s.month, text });
  if (s.headlines.length > HEADLINES) s.headlines.splice(0, s.headlines.length - HEADLINES);
}

/** Alvo de estabilidade da província e os fatores que o compõem (rótulo, valor), sem os nulos. */
export function stabilityTarget(s: GameState, pm: ProvinceMap, id: number): { target: number; factors: [string, number][] } {
  const n = s.nations[s.owner[id]], M = STAB.mod, f: [string, number][] = [];
  if (!n) return { target: 0, factors: [] };
  const add = (label: string, v: number) => { if (v) f.push([label, v]); };
  const laws = n.laws, lots = s.lots[id];
  if (n.grainShort && !(laws.includes('ration') && n.res.grain > 0)) add('Sem grãos', M.famine);
  if (n.atWar.length) {
    add('Guerra', M.war * n.atWar.length);
    const oldest = Math.min(...n.atWar.map(e => s.warSince[e < n.id ? `${e}:${n.id}` : `${n.id}:${e}`] ?? s.month));
    add('Guerra longa', Math.max(M.longWarMax, M.longWarPer12 * Math.floor((s.month - oldest) / 12)));
  } else add('Paz', M.peace);
  if (!laws.includes('shorter')) add('Fábricas', M.factory * lots.reduce((k, b) => k + (b && (b.type === 'steelworks' || b.type === 'arms_factory') ? activeLevel(b) : 0), 0));
  const lvl = cityLevel(s, id);
  add('Cidade grande', lvl >= 3 ? M.city3 : lvl === 2 ? M.city2 : 0);
  if (!s.connected[id]) add('Desligada', M.disconnected);
  const since = s.month - s.conquered[id];
  if (since < M.conqueredMonths) add('Conquista recente', Math.round(M.conquered * (1 - since / M.conqueredMonths) * 100) / 100);
  const g = Math.max(0, ...lots.map(b => (b?.type === 'garrison' ? activeLevel(b) : 0)));
  if (g) add('Guarnição', M.garrison + M.garrisonPerLevel * (g - 1));
  add('Mercado', M.market * Math.max(0, ...lots.map(b => (b?.type === 'market' ? activeLevel(b) : 0))));
  if (n.capital === id) add('Capital', M.capital);
  if (laws.includes('bread')) add('Pão e circo', M.bread);
  if (laws.includes('ration')) add('Racionamento', M.ration);
  if (s.month < s.resentment[id]) add('Ressentimento', M.resentment);
  void pm;
  const target = Math.max(0, Math.min(100, STAB.base + f.reduce((k, [, v]) => k + v, 0)));
  return { target, factors: f };
}

/** Virada do mês: a estabilidade de cada província com dono anda `approach` do caminho até o alvo. */
export function stabilityMonth(s: GameState, pm: ProvinceMap): void {
  s.owner.forEach((o, id) => {
    if (o < 0 || !s.city[id]) return;
    const { target } = stabilityTarget(s, pm, id), cur = s.stability[id];
    let d = (target - cur) * STAB.approach;
    if (d > 0 && s.month < s.resentment[id]) d /= 2; // ressentimento: a confiança volta devagar
    s.stability[id] = Math.max(0, Math.min(100, cur + d));
  });
}
