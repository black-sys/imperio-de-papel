import type { ProvinceMap, VeinKind } from '../worldgen/provinces';
import { AI, AI_BENT, TROOPS, type BuildingType } from './balance';
import { build, colonize, moveArmies, recruit, upgrade, upgradeCity, type Place } from './commands';
import { colonizeCost, recruitCost, runMonth, type MonthReport } from './economy';
import { buildRoute, supplyArmy } from './routes';
import type { MoveGrid } from './movegrid';
import { activeLevel, cityLevel, type GameState } from './state';
import { inBattle, men, mergeArmies, provinceAt } from './armies';
import { hostile } from './war';

const VEIN_BUILDING: Record<VeinKind, BuildingType> = { grain: 'farm', wood: 'sawmill', coal: 'coal_mine', iron: 'iron_mine' };
type Action = 'colonize' | 'veins' | 'lots' | 'upgrades' | 'recruit';
/** Para onde vai o dinheiro primeiro, por inclinação. */
const ORDER: Record<GameState['nations'][0]['bent'], Action[]> = {
  militarist: ['recruit', 'colonize', 'veins', 'lots', 'upgrades'],
  expansionist: ['colonize', 'veins', 'lots', 'upgrades', 'recruit'],
  industrial: ['veins', 'lots', 'upgrades', 'colonize', 'recruit'],
};

/**
 * Uma decisão mensal da nação `n` com as mesmas regras e comandos do jogador: rotas, economia (colonizar, veios,
 * indústria, mercados, melhorias), recrutamento até o teto com reserva de manutenção, e ataque a fortalezas.
 */
export function aiStep(s: GameState, pm: ProvinceMap, grid: MoveGrid, n: number): void {
  const nation = s.nations[n], w = AI_BENT[nation.bent];
  if (!nation.alive || s.owner[nation.capital] !== n) return;
  const mine = () => s.owner.map((o, id) => (o === n ? id : -1)).filter(id => id >= 0);
  const owned = (k: VeinKind) => mine().reduce((c, id) => c + pm.provinces[id].veins.filter(v => v.kind === k).length, 0);
  const have = (k: VeinKind) => mine().some(id => s.veins[id].some((b, i) => b && pm.provinces[id].veins[i].kind === k));
  // vizinha com mais veios úteis; carvão e ferro valem o triplo até ter 3 de cada; sem nenhum veio de madeira,
  // ela vem antes de tudo (colonizar custa madeira e os lenhadores da capital não bastam)
  const want = (k: VeinKind) => (k === 'coal' || k === 'iron' ? (owned(k) === 0 ? 10 : owned(k) < 3 ? 3 : 1) : k === 'wood' && owned('wood') === 0 ? 20 : have(k) ? 1 : 2);
  const score = (id: number) => pm.provinces[id].veins.reduce((a, v) => a + v.richness * want(v.kind), 0) + pm.provinces[id].fertility * 0.5;
  const count = (type: BuildingType) => mine().reduce((c, id) => c + s.lots[id].filter(b => b?.type === type).length, 0);
  const proj: MonthReport = runMonth(s, pm, false, n);
  defend(s, pm, grid, n);
  recompose(s, pm, grid, n);
  const colonized = mine().length > 1 || s.colonizing.some(c => c.nation === n);

  // rotas (uma tentativa por cidade por mês): cada cidade sem ligação nem rota liga à cidade ligada mais próxima
  for (const id of mine()) {
    if (s.connected[id] || s.routes.some(r => r.a === id || r.b === id)) continue;
    const c = pm.provinces[id].city, dist = (q: number) => Math.hypot(pm.provinces[q].city.x - c.x, pm.provinces[q].city.y - c.y);
    const to = mine().filter(q => q !== id && s.connected[q]).sort((a, b) => dist(a) - dist(b))[0];
    if (to !== undefined) buildRoute(s, pm, grid, to, id, n);
  }

  const act: Record<Action, () => boolean> = {
    colonize: () => {
      const targets = new Set<number>();
      for (const id of mine()) for (const q of pm.provinces[id].neighbors) if (s.owner[q] === -1) targets.add(q);
      const best = [...targets].filter(t => !s.colonizing.some(c => c.province === t) && !s.fortresses.some(f => f.province === t)).sort((a, b) => score(b) - score(a))[0];
      return best !== undefined && colonize(s, pm, best, n).ok;
    },
    veins: () => {
      let did = false;
      // grãos primeiro se faltar comida; antes da 1ª colonização guarda o dinheiro (só fazenda se faltar comida)
      const order: VeinKind[] = proj.net.grain <= 0.5 ? ['grain', 'coal', 'iron', 'wood'] : ['coal', 'iron', 'wood', 'grain'];
      for (const kind of colonized ? order : proj.net.grain <= 0.5 ? ['grain' as VeinKind] : []) for (const id of mine()) pm.provinces[id].veins.forEach((v, i) => {
        if (v.kind === kind && !s.veins[id][i] && build(s, pm, id, { vein: i }, VEIN_BUILDING[kind], n).ok) did = true;
      });
      return did;
    },
    lots: () => {
      let did = false;
      // siderúrgica com carvão e ferro; fábrica de armas com aço; guarnições pela fração da inclinação; mercados
      for (const id of mine()) s.lots[id].forEach((b, lot) => {
        if (b) return;
        const place: Place = { lot }, list: BuildingType[] = [];
        if (have('coal') && have('iron') && count('steelworks') < 1 + Math.floor(mine().length / 6)) list.push('steelworks');
        if (count('steelworks') && count('arms_factory') < Math.ceil(count('steelworks') / 2)) list.push('arms_factory');
        if (mine().length >= 3 && count('garrison') < Math.ceil(mine().length * w.garrisonShare)) list.push('garrison');
        if (lot > 0) list.push('market'); // o lote 0 de cada cidade fica para a indústria
        for (const t of list) if (build(s, pm, id, place, t, n).ok) { did = true; break; }
      });
      return did;
    },
    upgrades: () => {
      let did = false;
      const rich = (id: number) => nation.res.money > (colonizeCost(s, pm, id, n).money ?? 0) * 2;
      for (const id of mine()) {
        if (proj.net.grain > 2 && cityLevel(s, id) < 3 && rich(id) && upgradeCity(s, pm, id, n).ok) did = true;
        for (const [list, key] of [[s.lots[id], 'lot'], [s.veins[id], 'vein']] as const)
          list.forEach((b, i) => { if (b && !b.remaining && b.level < 3 && rich(id) && upgrade(s, pm, id, key === 'lot' ? { lot: i } : { vein: i }, n).ok) did = true; });
      }
      return did;
    },
    recruit: () => {
      let did = false;
      // reserva: depois de pagar, sobra dinheiro para 3 meses do déficit projetado
      const reserve = 3 * Math.max(0, -proj.net.money);
      for (const id of mine()) s.lots[id].forEach((b, k) => {
        if (b?.type !== 'garrison' || nation.res.money - (recruitCost(s, 'line', n).money ?? 0) < reserve) return;
        if (recruit(s, pm, id, k, 'line', n).ok) did = true;
      });
      return did;
    },
  };
  for (let i = 0; i < 12; i++) {
    let did = false;
    for (const a of ORDER[nation.bent]) if (act[a]()) did = true;
    if (!did) break;
  }

  // exércitos prontos (parados, inteiros, fora de batalha); os que estão juntos viram um só antes de atacar
  const ready = () => s.armies.filter(a => a.owner === n && !a.path.length && s.clock >= a.routedUntil && !inBattle(s, a.id) &&
    a.battalions.every(b => b.soldiers >= TROOPS[b.type].soldiers * 0.9));
  for (const a of ready()) for (const b of ready()) if (a !== b && s.armies.includes(a) && s.armies.includes(b)) mergeArmies(s, a.id, b.id, n);
  const armies = ready(), battalions = armies.reduce((k, a) => k + a.battalions.length, 0);
  if (!armies.length) return;
  const cap = pm.provinces[nation.capital].center, d = (id: number) => Math.hypot(pm.provinces[id].center.x - cap.x, pm.provinces[id].center.y - cap.y);
  // alvos: as 6 fortalezas e as 6 províncias de nações em guerra mais próximas, só os que a margem da inclinação
  // já permite (esperar por um forte demais trava a expansão). Capital inimiga vem primeiro; faltando carvão ou
  // ferro, a fortaleza que guarda o minério; senão a defesa mais fraca, depois a mais perto
  const missing = (['coal', 'iron'] as VeinKind[]).filter(k => owned(k) === 0);
  const site = (id: number) => pm.provinces[id].city;
  const guard = (id: number) => Math.max(1, s.armies.reduce((k, a) => k + (hostile(s, a.owner, n) && Math.hypot(a.x - site(id).x, a.y - site(id).y) <= AI.targetTiles ? a.battalions.length : 0), 0));
  const forts = [...s.fortresses].sort((a, b) => d(a.province) - d(b.province)).slice(0, 6).map(f => ({ id: f.province, def: f.garrison.length, capital: false }));
  const enemy = s.owner.map((o, id) => (o >= 0 && nation.atWar.includes(o) ? id : -1)).filter(id => id >= 0)
    .sort((a, b) => d(a) - d(b)).slice(0, 6).map(id => ({ id, def: guard(id), capital: s.nations[s.owner[id]].capital === id }));
  const options = [...forts, ...enemy].filter(o => battalions >= w.margin * o.def);
  const target = options.find(o => o.capital) ?? options.find(o => pm.provinces[o.id].veins.some(v => missing.includes(v.kind)) && s.owner[o.id] === -1)
    ?? options.sort((a, b) => a.def - b.def || d(a.id) - d(b.id))[0];
  if (target) {
    const site = pm.provinces[target.id].city;
    moveArmies(s, grid, armies.map(a => a.id), site.x, site.y, n);
    for (const a of armies) if (!a.supply) supplyArmy(s, pm, grid, a.id, n);
  }
}

const free = (s: GameState, n: number) => s.armies.filter(a => a.owner === n && !inBattle(s, a.id) && s.clock >= a.routedUntil);
const battalionsOf = (list: GameState['armies']) => list.reduce((k, a) => k + a.battalions.length, 0);

/**
 * Invasores (exércitos de nações hostis em províncias de `n`): com força livre ≥ defendRatio × invasores, os livres
 * mais próximos vão ao invasor mais perto da capital; senão todos recuam para a capital.
 */
function defend(s: GameState, pm: ProvinceMap, grid: MoveGrid, n: number): void {
  const cap = pm.provinces[s.nations[n].capital].city;
  const invaders = s.armies.filter(a => a.owner >= 0 && hostile(s, a.owner, n) && s.owner[provinceAt(pm, grid, a.x, a.y)] === n);
  if (!invaders.length) return;
  const mine = free(s, n), need = battalionsOf(invaders);
  if (battalionsOf(mine) >= AI.defendRatio * need) {
    const t = invaders.sort((a, b) => Math.hypot(a.x - cap.x, a.y - cap.y) - Math.hypot(b.x - cap.x, b.y - cap.y))[0];
    const go: number[] = [];
    let sum = 0;
    for (const a of mine.sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y))) {
      if (sum >= need) break;
      go.push(a.id); sum += a.battalions.length;
    }
    moveArmies(s, grid, go, t.x, t.y, n);
    for (const id of go) supplyArmy(s, pm, grid, id, n);
  } else {
    const away = mine.filter(a => Math.hypot(a.x - cap.x, a.y - cap.y) > AI.targetTiles).map(a => a.id);
    if (away.length) moveArmies(s, grid, away, cap.x, cap.y, n);
  }
}

/** Exército parado abaixo de recomposeBelow dos homens volta à província própria com Guarnição mais próxima. */
function recompose(s: GameState, pm: ProvinceMap, grid: MoveGrid, n: number): void {
  const homes = s.owner.map((o, id) => (o === n && s.lots[id].some(b => b?.type === 'garrison' && activeLevel(b) > 0) ? id : -1)).filter(id => id >= 0);
  if (!homes.length) return;
  for (const a of free(s, n)) {
    if (a.path.length) continue;
    const full = a.battalions.reduce((k, b) => k + TROOPS[b.type].soldiers, 0);
    if (men(a) >= AI.recomposeBelow * full || homes.includes(provinceAt(pm, grid, a.x, a.y))) continue;
    const home = homes.map(id => pm.provinces[id].city).sort((p, q) => Math.hypot(p.x - a.x, p.y - a.y) - Math.hypot(q.x - a.x, q.y - a.y))[0];
    moveArmies(s, grid, [a.id], home.x, home.y, n);
  }
}
