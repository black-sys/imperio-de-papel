import { BUILDINGS, TROOPS, type BuildingType } from '../src/sim/balance';
import { build, chooseCapital, colonize, moveArmies, recruit, setSpeed, upgrade, upgradeCity, type Place } from '../src/sim/commands';
import { colonizeCost, runMonth } from '../src/sim/economy';
import { placeFortresses } from '../src/sim/fortress';
import { buildRoute, supplyArmy } from '../src/sim/routes';
import { makeMoveGrid } from '../src/sim/movegrid';
import { cityLevel, newGame } from '../src/sim/state';
import { tick } from '../src/sim/tick';
import { inBattle, mergeArmies } from '../src/sim/armies';
import type { ProvinceMap, VeinKind } from '../src/worldgen/provinces';
import type { WorldMap } from '../src/worldgen/types';

const VEIN_BUILDING: Record<VeinKind, BuildingType> = { grain: 'farm', wood: 'sawmill', coal: 'coal_mine', iron: 'iron_mine' };

/**
 * Jogador automático guloso da economia industrial: coloniza a vizinha com os veios mais úteis, explora os veios,
 * ergue siderúrgica, fábrica de armas e mercados nos lotes e melhora cidades. Devolve marcos em meses.
 * Com `map`: há fortalezas; ele ergue guarnições, recruta infantaria até o teto e ataca a fortaleza mais fraca por perto.
 */
export function greedy(pm: ProvinceMap, maxMonths = 3000, map?: WorldMap) {
  const s = newGame(pm);
  const grid = map ? makeMoveGrid(map) : null;
  if (map) placeFortresses(s, pm, map.seed);
  chooseCapital(s, pm, pm.suggestedCapitals[0]);
  setSpeed(s, 1);
  const mine = () => s.owner.map((o, id) => (o === 0 ? id : -1)).filter(id => id >= 0);
  const owned = (k: VeinKind) => mine().reduce((n, id) => n + pm.provinces[id].veins.filter(v => v.kind === k).length, 0);
  const have = (k: VeinKind) => mine().some(id => s.veins[id].some((b, i) => b && pm.provinces[id].veins[i].kind === k));
  // vizinha com mais veios úteis; carvão e ferro valem o triplo até ter 3 de cada
  const want = (k: VeinKind) => (k === 'coal' || k === 'iron' ? (owned(k) === 0 ? 10 : owned(k) < 3 ? 3 : 1) : have(k) ? 1 : 2);
  const score = (id: number) => pm.provinces[id].veins.reduce((a, v) => a + v.richness * want(v.kind), 0) + pm.provinces[id].fertility * 0.5;
  const count = (type: BuildingType) => mine().reduce((n, id) => n + s.lots[id].filter(b => b?.type === type).length, 0);
  let firstColonize = -1, reach20 = -1, firstSteel = -1, firstFortress = -1, taken = 0;
  // joga até medir todos os marcos (ou o limite)
  for (let m = 0; m < maxMonths && (reach20 < 0 || firstSteel < 0 || (grid && firstFortress < 0)); m++) {
    const proj = runMonth(s, pm, false);
    // rotas (uma tentativa por mês: traçar custa uma busca no mapa todo): cada cidade sua sem ligação nem rota liga à
    // cidade ligada mais próxima
    if (grid) for (const id of mine()) {
      if (s.connected[id] || s.routes.some(r => r.a === id || r.b === id)) continue;
      const c = pm.provinces[id].city, dist = (q: number) => Math.hypot(pm.provinces[q].city.x - c.x, pm.provinces[q].city.y - c.y);
      const to = mine().filter(q => q !== id && s.connected[q]).sort((a, b) => dist(a) - dist(b))[0];
      if (to !== undefined) buildRoute(s, pm, grid, to, id);
    }
    for (let act = 0; act < 12; act++) {
      let did = false;
      // 1) colonizar
      const targets = new Set<number>();
      for (const id of mine()) for (const n of pm.provinces[id].neighbors) if (s.owner[n] === -1) targets.add(n);
      const best = [...targets].filter(t => !s.colonizing.some(c => c.province === t) && !s.fortresses.some(f => f.province === t)).sort((a, b) => score(b) - score(a))[0];
      if (best !== undefined && colonize(s, pm, best).ok) { did = true; if (firstColonize < 0) firstColonize = s.month; }
      // 2) veios: grãos primeiro se faltar comida, depois carvão e ferro, depois madeira
      const order: VeinKind[] = proj.net.grain <= 0.5 ? ['grain', 'coal', 'iron', 'wood'] : ['coal', 'iron', 'wood', 'grain'];
      // antes da 1ª colonização, guarda o dinheiro (só faz fazenda se faltar comida)
      for (const kind of firstColonize < 0 ? (proj.net.grain <= 0.5 ? ['grain' as VeinKind] : []) : order) for (const id of mine()) pm.provinces[id].veins.forEach((v, i) => {
        if (v.kind === kind && !s.veins[id][i] && build(s, pm, id, { vein: i }, VEIN_BUILDING[kind]).ok) did = true;
      });
      // 3) lotes: siderúrgica com carvão e ferro; fábrica de armas com aço; guarnições (com mapa); mercados
      for (const id of mine()) s.lots[id].forEach((b, lot) => {
        if (b) return;
        const place: Place = { lot };
        const want: BuildingType[] = [];
        if (have('coal') && have('iron') && count('steelworks') < 1 + Math.floor(mine().length / 6)) want.push('steelworks');
        if (count('steelworks') && count('arms_factory') < Math.ceil(count('steelworks') / 2)) want.push('arms_factory');
        if (grid && mine().length >= 3 && count('garrison') < Math.ceil(mine().length / 2)) want.push('garrison');
        if (lot > 0) want.push('market'); // o lote 0 de cada cidade fica para a indústria
        for (const t of want) if (build(s, pm, id, place, t).ok) { did = true; break; }
      });
      // 4) melhorias: minas primeiro (destravam o aço); cidades com comida sobrando; o resto quando há folga de dinheiro
      const rich = (id: number) => s.res.money > (colonizeCost(s, pm, id).money ?? 0) * 2;
      for (const id of mine()) {
        if (proj.net.grain > 2 && cityLevel(s, id) < 3 && rich(id) && upgradeCity(s, pm, id).ok) did = true;
        for (const [list, key] of [[s.lots[id], 'lot'], [s.veins[id], 'vein']] as const)
          list.forEach((b, i) => { if (b && !b.remaining && b.level < 3 && rich(id) && upgrade(s, pm, id, key === 'lot' ? { lot: i } : { vein: i }).ok) did = true; });
      }
      if (!did) break;
    }
    if (grid) {
      for (const id of mine()) s.lots[id].forEach((b, k) => { if (b?.type === 'garrison') recruit(s, pm, id, k, 'line'); });
      // exércitos prontos (parados, inteiros, fora de batalha); os que estão juntos viram um só antes de atacar
      const ready = () => s.armies.filter(a => a.owner === 0 && !a.path.length && s.clock >= a.routedUntil && !inBattle(s, a.id) &&
        a.battalions.every(b => b.soldiers >= TROOPS[b.type].soldiers * 0.9));
      for (const a of ready()) for (const b of ready()) if (a !== b && s.armies.includes(a) && s.armies.includes(b)) mergeArmies(s, a.id, b.id);
      const armies = ready(), battalions = armies.reduce((n, a) => n + a.battalions.length, 0);
      const cap = pm.provinces[s.capital].center, d = (id: number) => Math.hypot(pm.provinces[id].center.x - cap.x, pm.provinces[id].center.y - cap.y);
      // faltando carvão ou ferro, a fortaleza que guarda esse minério vem primeiro; senão a mais fraca entre as 6 mais próximas
      const missing = (['coal', 'iron'] as VeinKind[]).filter(k => owned(k) === 0);
      const guards = (f: (typeof s.fortresses)[0]) => pm.provinces[f.province].veins.some(v => missing.includes(v.kind));
      const near = [...s.fortresses].sort((a, b) => d(a.province) - d(b.province)).slice(0, 6);
      const target = near.find(guards) ?? near.sort((a, b) => a.garrison.length - b.garrison.length || d(a.province) - d(b.province))[0];
      // com o dobro de batalhões da guarnição inimiga, ataca (e abastece o exército atacante)
      if (target && battalions >= 2 * target.garrison.length) {
        const site = pm.provinces[target.province].city;
        moveArmies(s, grid, armies.map(a => a.id), site.x, site.y);
        for (const a of armies) if (!a.supply) supplyArmy(s, pm, grid, a.id);
      }
    }
    // a virada deste mês produz aço? (siderúrgica pronta com carvão e ferro no estoque)
    const makesSteel = runMonth(s, pm, false).lines.steel.some(([label, v]) => label === BUILDINGS.steelworks.plural && v > 0);
    const before = s.fortresses.length;
    tick(s, pm, 10, grid);
    if (firstSteel < 0 && makesSteel) firstSteel = s.month;
    if (s.fortresses.length < before) { taken += before - s.fortresses.length; if (firstFortress < 0) firstFortress = s.month; }
    if (reach20 < 0 && s.owner.filter(o => o === 0).length >= 20) reach20 = s.month;
  }
  return { firstColonize, reach20, firstSteel, firstFortress, taken, state: s };
}
