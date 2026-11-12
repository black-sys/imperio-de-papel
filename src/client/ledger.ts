import { RES_KEYS, RES_NAMES, UI, type Res } from '../sim/balance';
import type { MonthReport } from '../sim/economy';
import type { GameState } from '../sim/state';
import type { ProvinceMap } from '../worldgen/provinces';
import { RES_ICON } from './labels';

/** Seta da tendência do saldo mensal. */
export const trend = (net: number) => (net > UI.stableBelow ? '▲' : net < -UI.stableBelow ? '▼' : '▬');
/** Meses até o estoque acabar com este saldo (null se não cai). */
export const runsOutIn = (stock: number, net: number) => (net < -UI.stableBelow ? Math.max(0, Math.ceil(stock / -net)) : null);
/** Situação do recurso em palavras: "sobe", "estável" ou "acaba em N meses". */
export function situation(stock: number, net: number): string {
  const m = runsOutIn(stock, net);
  return m !== null ? `acaba em ${m} ${m === 1 ? 'mês' : 'meses'}` : net > UI.stableBelow ? 'sobe' : 'estável';
}
const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
const num = (v: number) => (Math.round(v * 10) / 10).toLocaleString('pt-BR');
const signed = (v: number) => `${v >= 0 ? '+' : '−'}${num(Math.abs(v))}`;

/** Gráfico do estoque nos meses guardados + projeção tracejada de 6 meses pelo saldo atual (SVG em texto). */
export function sparkline(stock: number[], net: number, w = 160, h = 36): string {
  const proj = stock.length ? Array.from({ length: 7 }, (_, i) => Math.max(0, stock[stock.length - 1] + net * i)) : [];
  const all = [...stock, ...proj], lo = Math.min(0, ...all), hi = Math.max(1, ...all), n = stock.length + Math.max(0, proj.length - 1);
  const x = (i: number) => (n <= 1 ? w / 2 : (i / (n - 1)) * (w - 2) + 1), y = (v: number) => h - 2 - ((v - lo) / (hi - lo)) * (h - 4);
  const pts = (vs: number[], from: number) => vs.map((v, i) => `${x(from + i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="spark">`
    + (stock.length ? `<polyline fill="none" stroke="#6b5536" stroke-width="1.6" points="${pts(stock, 0)}"/>` : '')
    + (proj.length ? `<polyline fill="none" stroke="${net < 0 ? '#8a2a20' : '#4f7a3a'}" stroke-width="1.3" stroke-dasharray="3 3" points="${pts(proj, stock.length - 1)}"/>` : '')
    + '</svg>';
}

/** Nome de uma parcela do detalhe: província, exército ou nação. */
function who(s: GameState, pm: ProvinceMap, key: string): string {
  const [t, id] = [key[0], Number(key.slice(2))];
  if (t === 'p') return pm.provinces[id]?.name ?? '?';
  if (t === 'a') return s.armies.find(a => a.id === id)?.name ?? 'exército';
  return s.nations[id]?.name ?? '?';
}

/**
 * Painel "Contas": um bloco por recurso (estoque, saldo, situação, gráfico, entradas e saídas por categoria; a categoria
 * em `open` mostra as parcelas por província/exército).
 */
export function ledgerHtml(s: GameState, pm: ProvinceMap, report: MonthReport, open: Set<string>, depot: Res): string {
  const me = s.nations[0], hist = me.history;
  const blocks = RES_KEYS.map(k => {
    const net = report.net[k], stock = me.res[k], label = RES_NAMES[k][0].toUpperCase() + RES_NAMES[k].slice(1);
    const rows = [...report.lines[k]].sort((a, b) => b[1] - a[1]).map(([cat, v]) => {
      const key = `${k}:${cat}`, parts = report.byProvince[k][cat] ?? [], opened = open.has(key);
      const detail = opened && parts.length ? `<div class="sub">${[...parts].sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).map(([p, x]) =>
        p[0] === 'p' ? `<a class="go" data-a="cn:${p.slice(2)}">${esc(who(s, pm, p))}</a> ${signed(x)}` : `${esc(who(s, pm, p))} ${signed(x)}`).join(' · ')}</div>` : '';
      return `<div class="lrow"><a class="go" data-a="lx:${esc(key)}">${parts.length ? (opened ? '▾' : '▸') : '·'} ${esc(cat)}</a><span class="${v < 0 ? 'neg' : 'pos'}">${signed(v)}</span></div>${detail}`;
    }).join('') || '<div class="sub">Nada entra nem sai.</div>';
    const held = depot[k] >= 0.5 ? `<div class="why">Em depósito: ${num(depot[k])} (cidades desligadas) — ligue por rota para receber</div>` : '';
    const sit = situation(stock, net);
    return `<div class="slot"><div class="lhead"><b>${RES_ICON[k]} ${label}</b> ${num(stock)}
      <span class="${net < -UI.stableBelow ? 'neg' : net > UI.stableBelow ? 'pos' : ''}">${trend(net)} ${signed(net)}/mês</span>
      <small class="${sit.startsWith('acaba') ? 'why' : 'sub'}">${sit}</small></div>
      ${sparkline(hist.map(h => h.stock[k]), net)}${rows}${held}</div>`;
  }).join('');
  return `<button class="x" data-a="close">✕</button><h2>Contas</h2><div class="sub">Saldo do mês que vem, por recurso; ▸ abre o detalhe por província.</div>${blocks}`;
}

/** Dica resumida de um recurso na barra superior. */
export function resourceTip(k: keyof Res, stock: number, report: MonthReport): string {
  const lines = report.lines[k], net = report.net[k], label = RES_NAMES[k][0].toUpperCase() + RES_NAMES[k].slice(1);
  const best = [...lines].filter(l => l[1] > 0).sort((a, b) => b[1] - a[1])[0], worst = [...lines].filter(l => l[1] < 0).sort((a, b) => a[1] - b[1])[0];
  return [`${label}: ${num(stock)} · ${signed(net)}/mês · ${situation(stock, net)}`,
    best ? `Maior entrada: ${best[0]} ${signed(best[1])}` : 'Nada entra',
    worst ? `Maior saída: ${worst[0]} ${signed(worst[1])}` : 'Nada sai',
    '📒 clique para ver nas Contas'].join('\n');
}
