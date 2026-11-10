import { BUILDINGS, TROOPS, type BuildingType, type TroopType } from '../sim/balance';
import { checkBuild, checkColonize, checkRecruit, checkUpgrade, type Result } from '../sim/commands';
import { buildCost, colonizeCost, provinceIncome } from '../sim/economy';
import { activeLevel, type GameState } from '../sim/state';
import { inBattle } from '../sim/troops';
import { TROOP_ICON } from './view/troops';
import type { ProvinceMap } from '../worldgen/provinces';
import { BIOME_NAMES } from './map2d';

export interface PanelActions {
  colonize(id: number): void;
  build(id: number, slot: number, type: BuildingType): void;
  upgrade(id: number, slot: number): void;
  recruit(id: number, slot: number, type: TroopType): void;
  foundCapital(id: number): void;
  close(): void;
}

const el = document.getElementById('panel') as HTMLDivElement;
const TYPES: BuildingType[] = ['village', 'sawmill', 'quarry', 'market', 'garrison'];
const TROOP_TYPES: TroopType[] = ['spear', 'archer', 'cavalry'];
const cost = (c: { gold: number; wood: number; stone: number; months: number }) =>
  [c.gold && `🪙${Math.ceil(c.gold)}`, c.wood && `🪵${Math.ceil(c.wood)}`, c.stone && `🪨${Math.ceil(c.stone)}`].filter(Boolean).join(' ') + ` · ${+c.months.toFixed(1)} meses`;
const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
const bar = (label: string, v: number) => `<div class="fac"><span>${label}</span><i><b style="width:${(v / 1.5) * 100}%"></b></i><em>${v.toFixed(2)}</em></div>`;
const button = (action: string, label: string, r: Result, extra = '') =>
  `<button data-a="${action}" ${r.ok ? '' : 'disabled'} title="${r.ok ? '' : esc(r.reason)}">${label}${extra}</button>${r.ok ? '' : `<small class="why">${esc(r.reason)}</small>`}`;

let lastHtml = '';

/** Painel lateral da província selecionada. Re-renderiza só quando o conteúdo muda (cliques não se perdem). */
export function renderPanel(s: GameState | null, pm: ProvinceMap | null, id: number, act: PanelActions, troops: number[] = []): void {
  const picked = s ? s.troops.filter(t => troops.includes(t.id)) : [];
  if (!s || !pm || (id < 0 && picked.length === 0)) { el.style.display = 'none'; lastHtml = ''; return; }
  if (picked.length) return show(troopsHtml(s, picked), id, act);
  const p = pm.provinces[id], mine = s.owner[id] === 0, fort = s.fortresses.find(f => f.province === id);
  let html = `<button class="x" data-a="close">✕</button><h2>${esc(p.name)}</h2>
    <div class="sub">${s.capital === id ? 'Sua capital' : mine ? 'Seu reino' : fort ? 'Fortaleza neutra' : 'Neutra'} · ${BIOME_NAMES[p.biome]}${p.coastal ? ' · costeira' : ''}</div>
    ${bar('Fertilidade', p.fertility)}${bar('Floresta', p.forest)}${bar('Rocha', p.rock)}`;
  if (s.capital < 0) {
    html += pm.suggestedCapitals.includes(id)
      ? `<p>Uma boa terra para começar.</p><button class="big" data-a="found">Fundar capital aqui</button>`
      : `<p class="why">Escolha uma das províncias marcadas com o selo no mapa.</p>`;
  } else if (!mine) {
    const col = s.colonizing.find(c => c.province === id);
    if (fort) {
      const alive = s.troops.filter(t => t.owner === -1 && t.home === id);
      const count = (type: TroopType) => { const n = alive.filter(t => t.type === type).length; return n ? `${TROOP_ICON[type]} ${n} × ${TROOPS[type].name.toLowerCase()}` : ''; };
      html += `<p><b>Guarnição:</b> ${TROOP_TYPES.map(count).filter(Boolean).join(', ')}. Derrote-a para tomar a província.</p>`;
    }
    html += col ? `<p>Colonizando… faltam ${col.remaining.toFixed(1)} meses.</p>`
      : `<div class="act">${button('colonize', 'Colonizar', checkColonize(s, pm, id), ` <small>${cost(colonizeCost(s, pm, id))}</small>`)}</div>`;
  } else {
    const inc = provinceIncome(s, pm, id);
    html += `<div class="sub">Rende por mês: 🪙${inc.gold.toFixed(1)} 🪵${inc.wood.toFixed(1)} 🪨${inc.stone.toFixed(1)}</div><h3>Vagas</h3>`;
    s.buildings[id].forEach((b, slot) => {
      if (b) {
        const info = b.remaining > 0 ? ` <small>(obra: ${b.remaining.toFixed(1)} meses)</small>` : '';
        const up = b.level < 3 && b.remaining === 0 ? button(`up:${slot}`, `Melhorar`, checkUpgrade(s, pm, id, slot), ` <small>${cost(buildCost(b.type, b.level + 1))}</small>`) : '';
        let train = '';
        if (b.type === 'garrison' && activeLevel(b) > 0) {
          const q = s.recruiting.find(r => r.province === id && r.slot === slot);
          train = q ? `<small>Treinando ${TROOPS[q.type].name.toLowerCase()}… faltam ${q.remaining.toFixed(1)} meses</small>`
            : TROOP_TYPES.map(t => button(`r:${slot}:${t}`, `${TROOP_ICON[t]} ${TROOPS[t].name}`, checkRecruit(s, pm, id, slot, t), ` <small>${cost({ ...TROOPS[t].cost, months: TROOPS[t].months })}</small>`)).join('');
          train = `<div class="act">${train}</div>`;
        }
        html += `<div class="slot"><b>${BUILDINGS[b.type].name} ${'★'.repeat(b.level)}</b>${info}<div class="act">${up}</div>${train}</div>`;
      } else {
        html += `<div class="slot empty"><b>Vaga livre</b><div class="act">${TYPES.map(t =>
          button(`b:${slot}:${t}`, BUILDINGS[t].name, checkBuild(s, pm, id, slot, t), ` <small>${cost(buildCost(t, 1))}</small>`)).join('')}</div></div>`;
      }
    });
  }
  show(html, id, act);
}

function troopsHtml(s: GameState, troops: GameState['troops']): string {
  const rows = troops.map(t => {
    const state = s.clock < t.routedUntil ? 'em fuga' : inBattle(s, t.id) ? 'em batalha' : t.path.length ? 'marchando' : 'parada';
    return `<div class="slot"><b>${TROOP_ICON[t.type]} ${TROOPS[t.type].name}</b> ${Math.ceil(t.soldiers)}/${TROOPS[t.type].soldiers}<div class="sub">moral ${Math.round(t.morale * 100)}% · ${state}</div></div>`;
  });
  return `<button class="x" data-a="close">✕</button><h2>${troops.length === 1 ? 'Tropa' : `${troops.length} tropas`}</h2>
    <div class="sub">Clique direito no terreno ou no mapa para mandar</div>${rows.join('')}`;
}

function show(html: string, id: number, act: PanelActions): void {
  if (html === lastHtml) return;
  lastHtml = html;
  el.innerHTML = html;
  el.style.display = 'block';
  // pointerdown (não click): o painel é refeito várias vezes por segundo com o tempo correndo e um click
  // que começa num botão e termina no botão novo se perderia
  el.onpointerdown = e => {
    if (e.button !== 0) return;
    const a = (e.target as HTMLElement).closest('button')?.dataset.a;
    if (!a) return;
    if (a === 'close') act.close();
    else if (a === 'found') act.foundCapital(id);
    else if (a === 'colonize') act.colonize(id);
    else if (a.startsWith('up:')) act.upgrade(id, Number(a.slice(3)));
    else if (a.startsWith('r:')) { const [, slot, t] = a.split(':'); act.recruit(id, Number(slot), t as TroopType); }
    else if (a.startsWith('b:')) { const [, slot, t] = a.split(':'); act.build(id, Number(slot), t as BuildingType); }
    lastHtml = ''; // força re-render com o estado novo
  };
}

// ---- mensagens e dica ----
const toasts = document.getElementById('toasts') as HTMLDivElement;
export function toast(text: string): void {
  const d = document.createElement('div');
  d.textContent = text;
  toasts.appendChild(d);
  setTimeout(() => d.remove(), 5000);
  while (toasts.children.length > 5) toasts.firstElementChild!.remove();
}

const tip = document.getElementById('tip') as HTMLDivElement;
export function setTip(text: string | null, x = 0, y = 0): void {
  tip.style.display = text ? 'block' : 'none';
  if (!text) return;
  tip.textContent = text;
  tip.style.left = `${x + 14}px`; tip.style.top = `${y + 14}px`;
}
