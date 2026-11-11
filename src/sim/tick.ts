import type { ProvinceMap } from '../worldgen/provinces';
import { BATTLE, BUILDINGS, MONTH_SECONDS, TROOPS } from './balance';
import type { MoveGrid } from './movegrid';
import { spawnTroop, troopStep } from './troops';
import { runMonth } from './economy';
import { found, logEvent, type Building, type GameState } from './state';

const EPS = 1e-9;

/** Avança o tempo real `dtSeconds` na velocidade atual; paga a renda em cada virada de mês atravessada. */
export function tick(s: GameState, pm: ProvinceMap, dtSeconds: number, grid: MoveGrid | null): void {
  let months = (dtSeconds * s.speed) / MONTH_SECONDS;
  // tropas e batalhas em passos fixos: o resultado não depende da velocidade nem da taxa de quadros
  if (grid) for (s.stepAcc += months; s.stepAcc >= BATTLE.step - EPS; s.stepAcc -= BATTLE.step) {
    troopStep(s, pm, grid, BATTLE.step);
    s.clock = Math.round((s.clock + BATTLE.step) * 1e6) / 1e6;
  }
  while (months > EPS) {
    const toBoundary = Math.floor(s.month + EPS) + 1 - s.month;
    const boundary = months >= toBoundary - EPS;
    const step = boundary ? toBoundary : months;
    advance(s, pm, step);
    s.month = boundary ? Math.round(s.month + step) : s.month + step;
    months -= step;
    if (boundary) {
      runMonth(s, pm, true);
      if (s.res.money < 0) {
        // sem dinheiro para pagar: a tropa mais cara debanda (empate: a mais nova)
        const cost = (t: (typeof s.troops)[0]) => TROOPS[t.type].upkeep.money ?? 0;
        const t = s.troops.filter(t => t.owner === 0).sort((a, b) => cost(b) - cost(a) || b.id - a.id)[0];
        if (t) { s.troops.splice(s.troops.indexOf(t), 1); logEvent(s, `${TROOPS[t.type].name} dispersa por falta de dinheiro`); }
      }
    }
  }
}

function advance(s: GameState, pm: ProvinceMap, step: number): void {
  const progress = (b: Building | null, id: number) => {
    if (!b || b.remaining <= 0) return;
    b.remaining -= step;
    if (b.remaining > EPS) return;
    b.remaining = 0;
    logEvent(s, `${BUILDINGS[b.type].name}${b.level > 1 ? ` nível ${b.level}` : ''} pronta em ${pm.provinces[id].name}`);
  };
  s.lots.forEach((list, id) => list.forEach(b => progress(b, id)));
  s.veins.forEach((list, id) => list.forEach(b => progress(b, id)));
  s.city.forEach((c, id) => {
    if (!c || c.remaining <= 0) return;
    c.remaining -= step;
    if (c.remaining > EPS) return;
    c.remaining = 0;
    logEvent(s, `Cidade de ${pm.provinces[id].name} chegou ao nível ${c.level}`);
  });
  for (const r of [...s.recruiting]) {
    r.remaining -= step;
    if (r.remaining > EPS) continue;
    s.recruiting.splice(s.recruiting.indexOf(r), 1);
    const p = pm.provinces[r.province], site = p.lots[r.lot] ?? p.city;
    spawnTroop(s, 0, r.type, site.x, site.y + 4); // ao lado do prédio, não em cima
    logEvent(s, `${TROOPS[r.type].name} treinada em ${p.name}`);
  }
  for (const c of [...s.colonizing]) {
    c.remaining -= step;
    if (c.remaining > EPS) continue;
    s.colonizing.splice(s.colonizing.indexOf(c), 1);
    found(s, c.province);
    logEvent(s, `Colonização de ${pm.provinces[c.province].name} concluída`);
  }
}
