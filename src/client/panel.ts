import { BUILDINGS, CITY, TROOPS, type BuildingType, type TroopType } from '../sim/balance';
import { checkBuild, checkColonize, checkRecruit, checkUpgrade, checkUpgradeCity, type Place, type Result } from '../sim/commands';
import { buildCost, colonizeCost, recruitCost, runMonth } from '../sim/economy';
import { activeLevel, cityLevel, type GameState } from '../sim/state';
import { inBattle } from '../sim/troops';
import type { ProvinceMap } from '../worldgen/provinces';
import { costText, RES_ICON, roman, VEIN_NAME, veinLabel } from './labels';
import { TROOP_ICON } from './map/markers';
import { BIOME_NAMES } from './map2d';

export interface PanelActions {
  colonize(id: number): void;
  build(id: number, place: Place, type: BuildingType): void;
  upgrade(id: number, place: Place): void;
  upgradeCity(id: number): void;
  recruit(id: number, lot: number, type: TroopType): void;
  foundCapital(id: number): void;
  close(): void;
}
/** Lugar para onde o painel rola ao abrir (clique num lote ou veio no mapa). */
export type PanelFocus = { lot: number } | { vein: number } | null;

const el = document.getElementById('panel') as HTMLDivElement;
const LOT_TYPES: BuildingType[] = ['steelworks', 'arms_factory', 'market', 'garrison'];
const TROOP_TYPES: TroopType[] = ['line', 'artillery', 'cavalry'];
const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
const bar = (label: string, v: number) => `<div class="fac"><span>${label}</span><i><b style="width:${(v / 1.5) * 100}%"></b></i><em>${v.toFixed(2)}</em></div>`;
const button = (action: string, label: string, r: Result, extra = '') =>
  `<button data-a="${action}" ${r.ok ? '' : 'disabled'} title="${r.ok ? '' : esc(r.reason)}">${label}${extra}</button>${r.ok ? '' : `<small class="why">${esc(r.reason)}</small>`}`;
const stars = (n: number) => '★'.repeat(n);
const placeKey = (p: Place) => ('lot' in p ? `lot:${p.lot}` : `vein:${p.vein}`);

let lastHtml = '', lastFocus = '';

/** Veios da província e das vizinhas, resumidos ("Grãos ⅱ, Madeira ⅲ"). */
export function veinsAround(pm: ProvinceMap, id: number): string {
  const p = pm.provinces[id], all = [p, ...p.neighbors.map(n => pm.provinces[n])].flatMap(q => q.veins);
  return (['grain', 'wood', 'coal', 'iron'] as const).map(k => { const best = Math.max(0, ...all.filter(v => v.kind === k).map(v => v.richness)); return best ? `${VEIN_NAME[k]} ${roman(best)}` : ''; }).filter(Boolean).join(', ') || 'nenhum veio por perto';
}

/** Painel lateral da província selecionada. Re-renderiza só quando o conteúdo muda (cliques não se perdem). */
export function renderPanel(s: GameState | null, pm: ProvinceMap | null, id: number, act: PanelActions, troops: number[] = [], focus: PanelFocus = null): void {
  const picked = s ? s.troops.filter(t => troops.includes(t.id)) : [];
  if (!s || !pm || (id < 0 && picked.length === 0)) { el.style.display = 'none'; lastHtml = ''; lastFocus = ''; return; }
  if (picked.length) return show(troopsHtml(s, picked), id, act, '');
  const p = pm.provinces[id], mine = s.owner[id] === 0 && !!s.city[id], fort = s.fortresses.find(f => f.province === id);
  let html = `<button class="x" data-a="close">✕</button><h2>${esc(p.name)}</h2>
    <div class="sub">${s.capital === id ? 'Sua capital' : mine ? 'Seu reino' : fort ? 'Fortaleza neutra' : 'Neutra'} · ${BIOME_NAMES[p.biome]}${p.coastal ? ' · costeira' : ''}</div>
    ${bar('Fertilidade', p.fertility)}`;
  if (s.capital < 0) {
    html += pm.suggestedCapitals.includes(id)
      ? `<p>Uma boa terra para começar. Por perto: ${esc(veinsAround(pm, id))}.</p><button class="big" data-a="found">Fundar capital aqui</button>`
      : `<p class="why">Escolha uma das províncias marcadas com o selo no mapa.</p>`;
    html += veinsHtml(s, pm, id, false);
  } else if (!mine) {
    const col = s.colonizing.find(c => c.province === id);
    if (fort) {
      const alive = s.troops.filter(t => t.owner === -1 && t.home === id);
      const count = (type: TroopType) => { const n = alive.filter(t => t.type === type).length; return n ? `${TROOP_ICON[type]} ${n} × ${TROOPS[type].name.toLowerCase()}` : ''; };
      html += `<p><b>Guarnição:</b> ${TROOP_TYPES.map(count).filter(Boolean).join(', ')}. Derrote-a para tomar a província.</p>`;
    }
    html += col ? `<p>Colonizando… faltam ${col.remaining.toFixed(1)} meses.</p>`
      : `<div class="act">${button('colonize', 'Colonizar', checkColonize(s, pm, id), ` <small>${costText(colonizeCost(s, pm, id))}</small>`)}</div>`;
    html += veinsHtml(s, pm, id, false);
  } else {
    const rep = runMonth(s, pm, false, id), lvl = cityLevel(s, id), c = s.city[id]!;
    // cidade
    const cityWork = c.remaining > 0 ? ` <small>(subindo ao nível ${c.level}: ${c.remaining.toFixed(1)} meses)</small>` : '';
    const up = c.level < 3 && c.remaining === 0 ? button('upc', 'Melhorar cidade', checkUpgradeCity(s, pm, id), ` <small>${costText({ ...CITY.cost[c.level + 1], months: CITY.months[c.level + 1] })}</small>`) : '';
    html += `<h3>Cidade</h3><div class="slot"><b>${['', 'Vila', 'Cidade', 'Metrópole'][lvl]} ${stars(lvl)}</b>${cityWork}
      <div class="sub">Impostos ${RES_ICON.money}${(rep.lines.money.find(l => l[0] === 'Impostos')?.[1] ?? 0).toFixed(1)}/mês · consome ${RES_ICON.grain}${CITY.grain[lvl]}/mês</div><div class="act">${up}</div></div>`;
    // lotes
    html += `<h3>Lotes</h3>`;
    s.lots[id].forEach((b, lot) => {
      const place: Place = { lot }, key = placeKey(place);
      if (lot >= CITY.lots[lvl]) { html += `<div class="slot empty" id="${key}"><b>🔒 Lote ${lot + 1}</b><small class="why">Libera com a cidade nível ${CITY.lots.findIndex(n => n > lot)}</small></div>`; return; }
      if (!b) {
        html += `<div class="slot empty" id="${key}"><b>Lote livre</b><div class="act">${LOT_TYPES.map(t => button(`b:${key}:${t}`, BUILDINGS[t].name, checkBuild(s, pm, id, place, t), ` <small>${costText(buildCost(t, 1))}</small>`)).join('')}</div></div>`;
        return;
      }
      const stall = rep.stalled.find(x => x.lot === lot), def = BUILDINGS[b.type];
      const out = def.product ? rep.lines[def.product].find(l => l[0] === def.plural) : null;
      const status = b.remaining > 0 ? ` <small>(obra: ${b.remaining.toFixed(1)} meses)</small>`
        : stall ? ` <small class="why">${out && out[1] > 0 ? `Produzindo ${Math.round(out[1])} de ${def.out[activeLevel(b)]}` : 'Parada'}: falta ${esc(RES_LABEL[stall.missing])}</small>` : '';
      let train = '';
      if (b.type === 'garrison' && activeLevel(b) > 0) {
        const q = s.recruiting.find(r => r.province === id && r.lot === lot);
        train = q ? `<small>Treinando ${TROOPS[q.type].name.toLowerCase()}… faltam ${q.remaining.toFixed(1)} meses</small>`
          : TROOP_TYPES.map(t => button(`r:${lot}:${t}`, `${TROOP_ICON[t]} ${TROOPS[t].name}`, checkRecruit(s, pm, id, lot, t), ` <small>${costText({ ...recruitCost(s, t), months: TROOPS[t].months })}</small>`)).join('');
        train = `<div class="act">${train}</div>`;
      }
      html += `<div class="slot" id="${key}"><b>${def.name} ${stars(b.level)}</b>${status}<div class="act">${upgradeButton(s, pm, id, place)}</div>${train}</div>`;
    });
    html += veinsHtml(s, pm, id, true);
  }
  show(html, id, act, focus ? placeKey(focus) : '');
}

const RES_LABEL: Record<string, string> = { money: 'dinheiro', grain: 'grãos', wood: 'madeira', coal: 'carvão', iron: 'ferro', steel: 'aço', arms: 'armas' };

function upgradeButton(s: GameState, pm: ProvinceMap, id: number, place: Place): string {
  const b = 'lot' in place ? s.lots[id][place.lot] : s.veins[id][place.vein];
  if (!b || b.level >= 3 || b.remaining > 0) return '';
  return button(`up:${placeKey(place)}`, 'Melhorar', checkUpgrade(s, pm, id, place), ` <small>${costText(buildCost(b.type, b.level + 1))}</small>`);
}

/** Seção Veios: tipo, riqueza e produção; com `build`, o botão do prédio do recurso. */
function veinsHtml(s: GameState, pm: ProvinceMap, id: number, build: boolean): string {
  const veins = pm.provinces[id].veins;
  if (!veins.length) return `<h3>Veios</h3><p class="sub">Nenhum veio nesta província.</p>`;
  let html = '<h3>Veios</h3>';
  veins.forEach((v, i) => {
    const place: Place = { vein: i }, key = placeKey(place), b = s.veins[id][i];
    const type = (Object.keys(BUILDINGS) as BuildingType[]).find(t => BUILDINGS[t].vein === v.kind)!, def = BUILDINGS[type];
    const perMonth = (l: number) => (def.out[l] * v.richness).toFixed(1);
    if (!build) { html += `<div class="slot" id="${key}"><b>${veinLabel(v)}</b> <small>${def.name}: ${RES_ICON[def.product!]}${perMonth(1)}/mês no nível 1</small></div>`; return; }
    if (!b) { html += `<div class="slot empty" id="${key}"><b>${veinLabel(v)}</b><div class="act">${button(`b:${key}:${type}`, def.name, checkBuild(s, pm, id, place, type), ` <small>${costText(buildCost(type, 1))}</small>`)}</div></div>`; return; }
    const info = b.remaining > 0 ? ` <small>(obra: ${b.remaining.toFixed(1)} meses)</small>` : ` <small>${RES_ICON[def.product!]}${perMonth(activeLevel(b))}/mês</small>`;
    html += `<div class="slot" id="${key}"><b>${def.name} ${stars(b.level)}</b> <small>${veinLabel(v)}</small>${info}<div class="act">${upgradeButton(s, pm, id, place)}</div></div>`;
  });
  return html;
}

function troopsHtml(s: GameState, troops: GameState['troops']): string {
  const rows = troops.map(t => {
    const state = s.clock < t.routedUntil ? 'em fuga' : inBattle(s, t.id) ? 'em batalha' : t.path.length ? 'marchando' : 'parada';
    return `<div class="slot"><b>${TROOP_ICON[t.type]} ${TROOPS[t.type].name}</b> ${Math.ceil(t.soldiers)}/${TROOPS[t.type].soldiers}<div class="sub">moral ${Math.round(t.morale * 100)}% · ${state}</div></div>`;
  });
  return `<button class="x" data-a="close">✕</button><h2>${troops.length === 1 ? 'Tropa' : `${troops.length} tropas`}</h2>
    <div class="sub">Clique direito no terreno ou no mapa para mandar</div>${rows.join('')}`;
}

function show(html: string, id: number, act: PanelActions, focus: string): void {
  if (html !== lastHtml) {
    lastHtml = html;
    el.innerHTML = html;
    el.style.display = 'block';
  }
  // rola até o lugar clicado no mapa, uma vez por clique
  if (focus !== lastFocus) { lastFocus = focus; if (focus) document.getElementById(focus)?.scrollIntoView({ block: 'nearest' }); }
  // pointerdown (não click): o painel é refeito várias vezes por segundo com o tempo correndo e um click
  // que começa num botão e termina no botão novo se perderia
  el.onpointerdown = e => {
    if (e.button !== 0) return;
    const a = (e.target as HTMLElement).closest('button')?.dataset.a;
    if (!a) return;
    const parsePlace = (kind: string, i: string): Place => (kind === 'lot' ? { lot: Number(i) } : { vein: Number(i) });
    if (a === 'close') act.close();
    else if (a === 'found') act.foundCapital(id);
    else if (a === 'colonize') act.colonize(id);
    else if (a === 'upc') act.upgradeCity(id);
    else if (a.startsWith('up:')) { const [, k, i] = a.split(':'); act.upgrade(id, parsePlace(k, i)); }
    else if (a.startsWith('r:')) { const [, lot, t] = a.split(':'); act.recruit(id, Number(lot), t as TroopType); }
    else if (a.startsWith('b:')) { const [, k, i, t] = a.split(':'); act.build(id, parsePlace(k, i), t as BuildingType); }
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
