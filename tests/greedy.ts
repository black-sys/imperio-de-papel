import { build, chooseCapital, colonize, setSpeed, upgrade } from '../src/sim/commands';
import { colonizeCost } from '../src/sim/economy';
import { newGame } from '../src/sim/state';
import { tick } from '../src/sim/tick';
import type { ProvinceMap } from '../src/worldgen/provinces';

/** Jogador automático guloso: coloniza a melhor vizinha, constrói produção e melhora vilas. Devolve marcos em meses. */
export function greedy(pm: ProvinceMap, maxMonths = 3000) {
  const s = newGame(pm);
  chooseCapital(s, pm, pm.suggestedCapitals[0]);
  setSpeed(s, 1);
  const score = (id: number) => { const p = pm.provinces[id]; return p.fertility + 0.6 * p.forest + 0.6 * p.rock; };
  let firstColonize = -1, reach20 = -1;
  for (let m = 0; m < maxMonths && reach20 < 0; m++) {
    for (let act = 0; act < 10; act++) {
      let did = false;
      // 1) colonizar a melhor vizinha neutra
      const targets = new Set<number>();
      s.owner.forEach((o, id) => { if (o === 0) for (const n of pm.provinces[id].neighbors) if (s.owner[n] === -1) targets.add(n); });
      const best = [...targets].filter(t => !s.colonizing.some(c => c.province === t)).sort((a, b) => score(b) - score(a))[0];
      if (best !== undefined && colonize(s, pm, best).ok) { did = true; if (firstColonize < 0) firstColonize = s.month; }
      // 2) produção e melhorias
      s.owner.forEach((o, id) => {
        if (o !== 0) return;
        const slots = s.buildings[id], free = slots.indexOf(null), has = (t: string) => slots.some(b => b?.type === t);
        if (free >= 0 && !has('sawmill') && pm.provinces[id].forest >= 0.3 && build(s, pm, id, free, 'sawmill').ok) did = true;
        else if (free >= 0 && !has('quarry') && pm.provinces[id].rock >= 0.3 && build(s, pm, id, free, 'quarry').ok) did = true;
        else if (free >= 0 && !has('market') && build(s, pm, id, free, 'market').ok) did = true;
        slots.forEach((b, k) => { if (b && b.remaining === 0 && b.level < 3 && s.res.gold > colonizeCost(s, pm, id).gold * 2 && upgrade(s, pm, id, k).ok) did = true; });
      });
      if (!did) break;
    }
    tick(s, pm, 10);
    if (reach20 < 0 && s.owner.filter(o => o === 0).length >= 20) reach20 = s.month;
  }
  return { firstColonize, reach20, state: s };
}
