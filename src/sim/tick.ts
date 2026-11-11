import type { ProvinceMap } from '../worldgen/provinces';
import { BATTLE, BUILDINGS, MONTH_SECONDS, TROOPS, type TroopType } from './balance';
import type { MoveGrid } from './movegrid';
import { ARMY } from './balance';
import { inBattle, spawnArmy, troopStep } from './armies';
import { reinforcing } from './routes';
import { runMonth } from './economy';
import { diplomacyMonth } from './diplomacy';
import { found, logFor, type Building, type GameState } from './state';

const EPS = 1e-9;

/** Avança o tempo real `dtSeconds` na velocidade atual; paga a renda em cada virada de mês atravessada. */
export function tick(s: GameState, pm: ProvinceMap, dtSeconds: number, grid: MoveGrid | null): void {
  // tudo em passos fixos (tropas, IA, obras, virada do mês): o resultado não depende da velocidade nem da taxa de quadros
  for (s.stepAcc += (dtSeconds * s.speed) / MONTH_SECONDS; s.stepAcc >= BATTLE.step - EPS; s.stepAcc -= BATTLE.step) {
    if (grid) troopStep(s, pm, grid, BATTLE.step);
    s.clock = Math.round((s.clock + BATTLE.step) * 1e6) / 1e6;
    economyStep(s, pm, BATTLE.step);
  }
}

/** Obras, treino e colonização andam `months`; em cada virada de mês, a conta de cada nação. */
function economyStep(s: GameState, pm: ProvinceMap, months: number): void {
  while (months > EPS) {
    const toBoundary = Math.floor(s.month + EPS) + 1 - s.month;
    const boundary = months >= toBoundary - EPS;
    const step = boundary ? toBoundary : months;
    advance(s, pm, step);
    s.month = boundary ? Math.round(s.month + step) : s.month + step;
    months -= step;
    if (boundary) for (const n of s.nations) {
      if (!n.alive) continue;
      runMonth(s, pm, true, n.id);
      if (n.res.money < 0) {
        // sem dinheiro para pagar: o batalhão mais caro debanda (empate: o do exército mais novo)
        const cost = (t: TroopType) => TROOPS[t].upkeep.money ?? 0;
        let pick: { a: (typeof s.armies)[0]; i: number } | null = null;
        for (const a of s.armies) if (a.owner === n.id) a.battalions.forEach((b, i) => {
          if (!pick || cost(b.type) > cost(pick.a.battalions[pick.i].type) || (cost(b.type) === cost(pick.a.battalions[pick.i].type) && a.id > pick.a.id)) pick = { a, i };
        });
        if (pick) {
          const { a, i } = pick as { a: (typeof s.armies)[0]; i: number }, [b] = a.battalions.splice(i, 1);
          if (!a.battalions.length) s.armies.splice(s.armies.indexOf(a), 1);
          logFor(s, n.id, `Batalhão de ${TROOPS[b.type].name.toLowerCase()} disperso por falta de dinheiro`);
        }
      }
    }
    if (boundary && s.nations.length) diplomacyMonth(s, pm); // depois das contas de todas as nações
  }
}

function advance(s: GameState, pm: ProvinceMap, step: number): void {
  const progress = (b: Building | null, id: number) => {
    if (!b || b.remaining <= 0) return;
    b.remaining -= step;
    if (b.remaining > EPS) return;
    b.remaining = 0;
    logFor(s, s.owner[id], `${BUILDINGS[b.type].name}${b.level > 1 ? ` nível ${b.level}` : ''} pronta em ${pm.provinces[id].name}`);
  };
  s.lots.forEach((list, id) => list.forEach(b => progress(b, id)));
  s.veins.forEach((list, id) => list.forEach(b => progress(b, id)));
  s.city.forEach((c, id) => {
    if (!c || c.remaining <= 0) return;
    c.remaining -= step;
    if (c.remaining > EPS) return;
    c.remaining = 0;
    logFor(s, s.owner[id], `Cidade de ${pm.provinces[id].name} chegou ao nível ${c.level}`);
  });
  for (const r of s.routes) {
    if (r.remaining <= 0) continue;
    r.remaining -= step;
    if (r.remaining > EPS) continue;
    r.remaining = 0;
    logFor(s, r.owner, `Rota ${pm.provinces[r.a].name}–${pm.provinces[r.b].name} pronta${r.cut ? ', mas cortada' : ''}`);
  }
  for (const r of [...s.recruiting]) {
    r.remaining -= step;
    if (r.remaining > EPS) continue;
    s.recruiting.splice(s.recruiting.indexOf(r), 1);
    const p = pm.provinces[r.province], site = p.lots[r.lot] ?? p.city, o = s.owner[r.province], nation = s.nations[o];
    if (!nation) continue; // a província mudou de mãos durante o treino
    // exército em batalha reforçado por esta cidade recebe o batalhão pela linha (mesmo passando de 8)
    const line = s.armies.find(a => reinforcing(s, a) === r.province);
    if (line) {
      line.battalions.push({ type: r.type, soldiers: TROOPS[r.type].soldiers });
      logFor(s, o, `Batalhão de ${TROOPS[r.type].name.toLowerCase()} chegou ao ${line.name} pela linha`);
      continue;
    }
    // entra num exército seu parado perto da cidade ou do prédio (com espaço); senão forma um novo ao lado do prédio
    const near = s.armies.find(a => a.owner === o && !a.path.length && s.clock >= a.routedUntil && !inBattle(s, a.id) &&
      a.battalions.length < ARMY.maxBattalions && Math.min(Math.hypot(a.x - p.city.x, a.y - p.city.y), Math.hypot(a.x - site.x, a.y - site.y)) <= 2 * ARMY.joinTiles);
    const bat = { type: r.type, soldiers: TROOPS[r.type].soldiers };
    if (near) near.battalions.push(bat);
    else spawnArmy(s, o, [bat], site.x, site.y + 4, -1, `${++nation.armyNumber}º Exército de ${pm.provinces[nation.capital].name}`);
    logFor(s, o, `${TROOPS[r.type].name} treinada em ${p.name}${near ? ` (${near.name})` : ''}`);
  }
  for (const c of [...s.colonizing]) {
    c.remaining -= step;
    if (c.remaining > EPS) continue;
    s.colonizing.splice(s.colonizing.indexOf(c), 1);
    found(s, c.province, c.nation);
    logFor(s, c.nation, `Colonização de ${pm.provinces[c.province].name} concluída`);
  }
}
