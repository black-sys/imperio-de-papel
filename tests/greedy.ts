import { TROOPS } from '../src/sim/balance';
import { build, chooseCapital, colonize, moveTroops, recruit, setSpeed, upgrade } from '../src/sim/commands';
import { placeFortresses } from '../src/sim/fortress';
import { makeMoveGrid } from '../src/sim/movegrid';
import { inBattle } from '../src/sim/troops';
import type { WorldMap } from '../src/worldgen/types';
import { colonizeCost } from '../src/sim/economy';
import { newGame } from '../src/sim/state';
import { tick } from '../src/sim/tick';
import type { ProvinceMap } from '../src/worldgen/provinces';

/**
 * Jogador automático guloso: coloniza a melhor vizinha, constrói produção e melhora vilas. Devolve marcos em meses.
 * Com `map`: há fortalezas; ele ergue guarnições, recruta lanceiros até o teto e ataca a fortaleza mais próxima.
 */
export function greedy(pm: ProvinceMap, maxMonths = 3000, map?: WorldMap) {
  const s = newGame(pm);
  const grid = map ? makeMoveGrid(map) : null;
  if (map) placeFortresses(s, pm, map.seed);
  let firstFortress = -1, taken = 0;
  chooseCapital(s, pm, pm.suggestedCapitals[0]);
  setSpeed(s, 1);
  // sem nenhuma província com rocha para pedreira, a primeira com rocha vale muito (sem pedra não há guarnição)
  const noRock = () => !s.owner.some((o, id) => o === 0 && pm.provinces[id].rock >= 0.3);
  const score = (id: number) => { const p = pm.provinces[id]; return p.fertility + 0.6 * p.forest + 0.6 * p.rock + (p.rock >= 0.3 && noRock() ? 3 : 0); };
  let firstColonize = -1, reach20 = -1;
  for (let m = 0; m < maxMonths && reach20 < 0; m++) {
    let saving = false; // juntando pedra para uma guarnição: não gasta em serraria nem mercado
    if (grid) { // guarnições antes da produção: a pedra é disputada com mercados e serrarias
      const owned = s.owner.filter(o => o === 0).length;
      let garrisons = 0;
      s.owner.forEach((o, id) => { if (o === 0) garrisons += s.buildings[id].filter(b => b?.type === 'garrison').length; });
      // 0) guarnições (a partir de 3 províncias, em metade delas) e lanceiros até o teto
      s.owner.forEach((o, id) => {
        if (o !== 0) return;
        const slots = s.buildings[id], free = slots.indexOf(null);
        if (owned >= 3 && garrisons < Math.ceil(owned / 2) && free >= 0 && build(s, pm, id, free, 'garrison').ok) garrisons++;
        saving = owned >= 3 && garrisons < Math.ceil(owned / 2);
        slots.forEach((b, k) => { if (b?.type === 'garrison') recruit(s, pm, id, k, 'spear'); });
      });
    }
    for (let act = 0; act < 10; act++) {
      let did = false;
      // 1) colonizar a melhor vizinha neutra
      const targets = new Set<number>();
      s.owner.forEach((o, id) => { if (o === 0) for (const n of pm.provinces[id].neighbors) if (s.owner[n] === -1) targets.add(n); });
      const best = [...targets].filter(t => !s.colonizing.some(c => c.province === t) && !s.fortresses.some(f => f.province === t)).sort((a, b) => score(b) - score(a))[0];
      if (best !== undefined && colonize(s, pm, best).ok) { did = true; if (firstColonize < 0) firstColonize = s.month; }
      // 2) produção e melhorias
      s.owner.forEach((o, id) => {
        if (o !== 0) return;
        const slots = s.buildings[id], free = slots.indexOf(null), has = (t: string) => slots.some(b => b?.type === t);
        if (free >= 0 && !has('sawmill') && !saving && pm.provinces[id].forest >= 0.3 && build(s, pm, id, free, 'sawmill').ok) did = true;
        else if (free >= 0 && !has('quarry') && pm.provinces[id].rock >= 0.3 && build(s, pm, id, free, 'quarry').ok) did = true;
        else if (free >= 0 && !has('market') && !saving && build(s, pm, id, free, 'market').ok) did = true;
        slots.forEach((b, k) => { if (b && b.remaining === 0 && b.level < 3 && s.res.gold > colonizeCost(s, pm, id).gold * 2 && upgrade(s, pm, id, k).ok) did = true; });
      });
      if (!did) break;
    }
    if (grid) {
      // 4) com o dobro da guarnição inimiga em tropas prontas, ataca a fortaleza mais próxima da capital
      const ready = s.troops.filter(t => t.owner === 0 && !t.path.length && s.clock >= t.routedUntil && !inBattle(s, t.id) && t.soldiers >= TROOPS[t.type].soldiers * 0.9);
      const cap = pm.provinces[s.capital].center, d = (id: number) => Math.hypot(pm.provinces[id].center.x - cap.x, pm.provinces[id].center.y - cap.y);
      const target = [...s.fortresses].sort((a, b) => d(a.province) - d(b.province))[0];
      if (target && ready.length >= 2 * target.garrison.length) {
        const site = pm.provinces[target.province].sites[0];
        moveTroops(s, grid, ready.map(t => t.id), site.x, site.y);
      }
    }
    const before = s.fortresses.length;
    tick(s, pm, 10, grid);
    if (s.fortresses.length < before) { taken += before - s.fortresses.length; if (firstFortress < 0) firstFortress = s.month; }
    if (reach20 < 0 && s.owner.filter(o => o === 0).length >= 20) reach20 = s.month;
  }
  return { firstColonize, reach20, firstFortress, taken, state: s };
}
