import type { ProvinceMap } from '../worldgen/provinces';
import { BUILDINGS, RES_KEYS, RES_NAMES, UI, UNREST, type Res } from './balance';
import { armyCap, battalionCount } from './armies';
import { training } from './commands';
import { runMonth, type MonthReport } from './economy';
import { activeLevel, type GameState } from './state';

export type AlertKind = 'stalled' | 'running-out' | 'money-negative' | 'famine' | 'disconnected' | 'unsupplied' | 'revolt' | 'strike' | 'cap';
export interface Alert { kind: AlertKind; severity: 'red' | 'amber'; text: string; hint: string; target: { province?: number; army?: number } }

const cap = (t: string) => t[0].toUpperCase() + t.slice(1);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
// prioridade do motivo de fábrica parada: o que resolver primeiro
const WHY: Record<string, number> = { revolt: 0, strike: 1, route: 2 };

/** Problemas do momento para a nação `n`: derivados do estado (e da conta do mês, se já calculada), vermelhos primeiro. */
export function alerts(s: GameState, pm: ProvinceMap, n: number, report?: MonthReport): Alert[] {
  const me = s.nations[n];
  if (!me?.alive) return [];
  const r = report ?? runMonth(s, pm, false, n), out: Alert[] = [], name = (id: number) => pm.provinces[id].name;
  // fábricas paradas: um alerta por fábrica, com o motivo de maior prioridade
  const seen = new Set<string>();
  for (const st of [...r.stalled].sort((a, b) => (WHY[a.missing] ?? 3) - (WHY[b.missing] ?? 3))) {
    const key = `${st.province}:${st.lot}`, b = s.lots[st.province][st.lot];
    if (seen.has(key) || !b) continue;
    seen.add(key);
    const res = st.missing in RES_NAMES ? RES_NAMES[st.missing as keyof Res] : '';
    const why = st.missing === 'revolt' ? 'revolta' : st.missing === 'strike' ? 'greve' : st.missing === 'route' ? 'sem rota até a capital' : `falta ${res}`;
    const hint = st.missing === 'revolt' ? 'derrote os rebeldes' : st.missing === 'strike' ? 'espere a greve acabar ou reprima'
      : st.missing === 'route' ? 'trace uma rota até a capital (R)' : `explore um veio de ${res} ou compre ${res} (Comércio)`;
    out.push({ kind: 'stalled', severity: 'amber', text: `${BUILDINGS[b.type].name} de ${name(st.province)} parada: ${why}`, hint, target: { province: st.province } });
  }
  // dinheiro: negativo em até 3 meses é vermelho; os outros recursos avisam com 6 meses
  const ahead = r.net.money < 0 ? Math.ceil(me.res.money / -r.net.money) : Infinity;
  if (me.res.money + UI.moneyAhead * r.net.money < 0)
    out.push({ kind: 'money-negative', severity: 'red', text: `Dinheiro negativo${me.res.money < 0 ? '' : ` em ${plural(Math.max(1, ahead), 'mês', 'meses')}`} — batalhões serão dispersos`, hint: 'corte tropas ou aumente impostos (Mercados)', target: {} });
  if (me.grainShort) out.push({ kind: 'famine', severity: 'red', text: 'Sem grãos: impostos pela metade e estabilidade −25', hint: 'fazendas ou Racionamento', target: {} });
  for (const k of RES_KEYS) {
    if (r.net[k] >= -1e-9 || (k === 'money' && out.some(a => a.kind === 'money-negative')) || (k === 'grain' && me.grainShort)) continue;
    const m = Math.ceil(me.res[k] / -r.net[k]);
    if (m > UI.runningOut) continue;
    const hint = k === 'grain' ? 'fazendas ou Racionamento' : k === 'money' ? 'mercados ou menos tropas' : 'explore um veio ou compre (Comércio)';
    out.push({ kind: 'running-out', severity: m <= UI.runningOutRed ? 'red' : 'amber', text: `${cap(RES_NAMES[k])} acabam em ${plural(Math.max(1, m), 'mês', 'meses')}`, hint, target: {} });
  }
  // cidades desligadas, exércitos sem suprimento
  s.owner.forEach((o, id) => {
    if (o !== n || !s.city[id] || s.connected[id]) return;
    out.push({ kind: 'disconnected', severity: 'amber', text: `${name(id)} desligada da capital`, hint: 'trace uma rota (R)', target: { province: id } });
  });
  for (const a of s.armies) if (a.owner === n && !a.supplied)
    out.push({ kind: 'unsupplied', severity: 'amber', text: `${a.name} sem suprimento`, hint: 'abasteça (linha) ou volte ao território', target: { army: a.id } });
  // ordem interna
  for (const v of s.revolts) if (s.owner[v.province] === n) {
    const k = s.armies.find(a => a.id === v.army)?.battalions.length ?? 0, left = Math.max(0, Math.ceil(v.since + UNREST.revolt.months - s.month));
    out.push({ kind: 'revolt', severity: 'red', text: `Revolta em ${name(v.province)}: ${plural(k, 'batalhão rebelde', 'batalhões rebeldes')}`, hint: `derrote-os em ${plural(left, 'mês', 'meses')}`, target: { province: v.province } });
  }
  for (const g of s.strikes) if (s.owner[g.province] === n)
    out.push({ kind: 'strike', severity: 'amber', text: `Greve em ${name(g.province)}`, hint: `espere ${plural(Math.max(1, Math.ceil(g.until - s.month)), 'mês', 'meses')} ou reprima`, target: { province: g.province } });
  // teto de batalhões com Guarnição parada
  const idle = s.owner.some((o, id) => o === n && s.lots[id].some((b, lot) => b?.type === 'garrison' && activeLevel(b) > 0 && !s.recruiting.some(q => q.province === id && q.lot === lot)));
  if (idle && battalionCount(s, n) + training(s, n) >= armyCap(s, n) && armyCap(s, n) > 0)
    out.push({ kind: 'cap', severity: 'amber', text: 'Teto de batalhões', hint: 'erga ou melhore Guarnições', target: {} });
  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'red' ? -1 : 1));
}
