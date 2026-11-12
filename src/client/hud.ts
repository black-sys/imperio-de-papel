import type { Res } from '../sim/balance';
import { resourceTip, trend } from './ledger';
import type { MonthReport } from '../sim/economy';
import { RES_ICON } from './labels';
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const STAGES: Record<string, string> = { forma: 'Formando o continente', placas: 'Erguendo montanhas', umidade: 'Soprando os ventos', 'erosão': 'Esculpindo vales', rios: 'Traçando rios', biomas: 'Distribuindo biomas', 'províncias': 'Traçando fronteiras' };

export function initHud(opts: { seed: number; onGenerate: (seed: string) => void; getLink: () => string }): void {
  const input = $<HTMLInputElement>('seed');
  input.value = String(opts.seed);
  $('gen').onclick = () => opts.onGenerate(input.value.trim());
  input.onkeydown = e => { if (e.key === 'Enter') opts.onGenerate(input.value.trim()); e.stopPropagation(); };
  $('link').onclick = async () => {
    const btn = $('link');
    try { await navigator.clipboard.writeText(opts.getLink()); btn.textContent = 'Copiado!'; }
    catch { prompt('Copie o link:', opts.getLink()); }
    setTimeout(() => (btn.textContent = 'Copiar link'), 1500);
  };
}

export function setSeedField(seed: number): void { $<HTMLInputElement>('seed').value = String(seed); }

export function setProgress(stage: string | null, pct: number): void {
  $('stage').textContent = stage === null ? '' : STAGES[stage] ?? stage;
  ($('progress').firstElementChild as HTMLElement).style.width = `${Math.round(pct * 100)}%`;
  $('progress').style.visibility = stage === null ? 'hidden' : 'visible';
}

export function setInfo(i: { fps: number }): void {
  $('info').textContent = `${i.fps} fps`;
}

export function showError(msg: string | null, seed?: number): void {
  const el = $('error');
  el.style.display = msg ? 'block' : 'none';
  el.textContent = msg ? `Erro ao gerar a semente ${seed}: ${msg}` : '';
}

// ---- barra superior: recursos, data, velocidade ----
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
export const formatDate = (month: number) => `${MONTHS[Math.floor(month) % 12]}, ano ${Math.floor(month / 12) + 1}`;
const fmt = (v: number) => Math.floor(v).toLocaleString('pt-BR');
const sign = (v: number) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 10) / 10).toLocaleString('pt-BR')}`;

export function initTopbar(onSpeed: (v: number) => void): void {
  for (const b of document.querySelectorAll<HTMLButtonElement>('#speeds button')) b.onclick = () => { onSpeed(Number(b.dataset.speed)); b.blur(); };
}

const GROUPS: (keyof Res)[][] = [['money'], ['grain', 'wood', 'coal', 'iron'], ['steel', 'arms']];
let resBuilt = false;

/** Barra superior: recursos em grupos (estoque e, embaixo, saldo com seta), tropas, data e velocidade. */
export function setTopbar(t: { res: Res; report: MonthReport; month: number; speed: number; troops: string; depot: Res } | null, onResource?: (k: keyof Res) => void): void {
  $('topbar').style.display = t ? 'flex' : 'none';
  document.body.classList.toggle('playing', !!t);
  if (!t) return;
  if (!resBuilt) {
    resBuilt = true;
    $('res').innerHTML = GROUPS.map(g => g.map(k => `<span class="res" id="s-${k}"><span>${RES_ICON[k]} <b id="r-${k}">0</b></span><small id="i-${k}"></small></span>`).join('')).join('<span class="sep"></span>');
    for (const g of GROUPS) for (const k of g) $(`s-${k}`).onclick = () => onResource?.(k);
  }
  for (const g of GROUPS) for (const k of g) {
    const net = t.report.net[k], inc = $(`i-${k}`);
    $(`r-${k}`).textContent = fmt(t.res[k]);
    inc.textContent = `${trend(net)} ${sign(net)}`;
    inc.classList.toggle('neg', net < -0.05);
    inc.classList.toggle('pos', net > 0.05);
    $(`s-${k}`).title = resourceTip(k, t.res[k], t.report);
  }
  $('troops').textContent = t.troops;
  $('date').textContent = formatDate(t.month);
  for (const b of document.querySelectorAll<HTMLButtonElement>('#speeds button')) b.classList.toggle('on', Number(b.dataset.speed) === t.speed);
}
