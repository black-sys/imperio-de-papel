import { RES_NAMES, type Res } from '../sim/balance';
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

const RES_ORDER = ['money', 'grain', 'wood', 'coal', 'iron', 'steel', 'arms'] as const;
let resBuilt = false;

/** Barra superior: os sete recursos (valor, variação no mês, dica com origem e destino), tropas, data e velocidade. */
export function setTopbar(t: { res: Res; report: MonthReport; month: number; speed: number; troops: string } | null): void {
  $('topbar').style.display = t ? 'flex' : 'none';
  if (!t) return;
  if (!resBuilt) {
    resBuilt = true;
    $('res').innerHTML = RES_ORDER.map(k => `<span class="res" id="s-${k}">${RES_ICON[k]} <b id="r-${k}">0</b> <small id="i-${k}"></small></span>`).join('');
  }
  for (const k of RES_ORDER) {
    const net = t.report.net[k], inc = $(`i-${k}`);
    $(`r-${k}`).textContent = fmt(t.res[k]);
    inc.textContent = `${sign(net)}/mês`;
    inc.classList.toggle('neg', net < -0.05);
    const lines = t.report.lines[k].map(([label, v]) => `${sign(v)} ${label.toLowerCase()}`).join(', ');
    $(`s-${k}`).title = `${RES_NAMES[k][0].toUpperCase()}${RES_NAMES[k].slice(1)}: ${lines || 'nada entra nem sai'}`;
  }
  $('troops').textContent = t.troops;
  $('date').textContent = formatDate(t.month);
  for (const b of document.querySelectorAll<HTMLButtonElement>('#speeds button')) b.classList.toggle('on', Number(b.dataset.speed) === t.speed);
}
