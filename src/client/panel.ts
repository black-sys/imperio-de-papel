import { ARMY, BUILDINGS, CITY, DEPOT_MONTHS, REINFORCE, RES_NAMES, SUPPLY, TROOPS, type BuildingType, type TroopType } from '../sim/balance';
import { checkBuild, checkColonize, checkRecruit, checkUpgrade, checkUpgradeCity, type Place, type Result } from '../sim/commands';
import { buildCost, cityTax, colonizeCost, recruitCost, runMonth } from '../sim/economy';
import { activeLevel, cityLevel, type GameState } from '../sim/state';
import { inBattle, men } from '../sim/armies';
import { reinforcing } from '../sim/routes';
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
  startRoute(id: number): void;
  removeRoute(routeId: number): void;
  supply(armyId: number): void;
  dropSupply(armyId: number): void;
  split(armyId: number, indices: number[]): void;
  merge(intoId: number, fromId: number): void;
  rename(armyId: number): void;
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
export function renderPanel(s: GameState | null, pm: ProvinceMap | null, id: number, act: PanelActions, armies: number[] = [], focus: PanelFocus = null): void {
  const picked = s ? s.armies.filter(t => armies.includes(t.id)) : [];
  if (!s || !pm || (id < 0 && picked.length === 0)) { el.style.display = 'none'; lastHtml = ''; lastFocus = ''; return; }
  if (picked.length) return show(armiesHtml(s, pm, picked), id, act, '');
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
      const alive = s.armies.find(t => t.owner === -1 && t.home === id)?.battalions ?? [];
      const count = (type: TroopType) => { const n = alive.filter(t => t.type === type).length; return n ? `${TROOP_ICON[type]} ${n} × ${TROOPS[type].name.toLowerCase()}` : ''; };
      html += `<p><b>Guarnição:</b> ${TROOP_TYPES.map(count).filter(Boolean).join(', ')}. Derrote-a para tomar a província.</p>`;
    }
    html += col ? `<p>Colonizando… faltam ${col.remaining.toFixed(1)} meses.</p>`
      : `<div class="act">${button('colonize', 'Colonizar', checkColonize(s, pm, id), ` <small>${costText(colonizeCost(s, pm, id))}</small>`)}</div>`;
    html += veinsHtml(s, pm, id, false);
  } else {
    const rep = runMonth(s, pm, false), lvl = cityLevel(s, id), c = s.city[id]!;
    // cidade
    const cityWork = c.remaining > 0 ? ` <small>(subindo ao nível ${c.level}: ${c.remaining.toFixed(1)} meses)</small>` : '';
    const up = c.level < 3 && c.remaining === 0 ? button('upc', 'Melhorar cidade', checkUpgradeCity(s, pm, id), ` <small>${costText({ ...CITY.cost[c.level + 1], months: CITY.months[c.level + 1] })}</small>`) : '';
    html += `<h3>Cidade</h3><div class="slot"><b>${['', 'Vila', 'Cidade', 'Metrópole'][lvl]} ${stars(lvl)}</b>${cityWork}
      <div class="sub">Impostos ${RES_ICON.money}${cityTax(s, pm, id).toFixed(1)}/mês · consome ${RES_ICON.grain}${CITY.grain[lvl]}/mês</div><div class="act">${up}</div></div>`;
    // ligação com a capital e rotas
    const dep = (Object.keys(RES_ICON) as (keyof typeof RES_ICON)[]).filter(k => s.depot[id][k] >= 0.5).map(k => `${RES_ICON[k]}${Math.floor(s.depot[id][k])}`).join(' ');
    html += s.connected[id] ? `<div class="sub">🔗 Ligada à capital</div>`
      : `<div class="why">⛓ Desligada da capital${dep ? `: depósito ${dep}` : ''} (teto ${DEPOT_MONTHS} meses)</div>`;
    const name = (p: number) => esc(pm.provinces[p].name);
    const rows = s.routes.filter(r => r.a === id || r.b === id).map(r => {
      const other = r.a === id ? r.b : r.a, state = r.remaining > 0 ? `em obra ${r.remaining.toFixed(1)} meses` : r.cut ? '<span class="why">cortada</span>' : 'pronta';
      return `<div class="slot">→ ${name(other)} · ${state} <button data-a="rr:${r.id}">Remover</button></div>`;
    }).join('');
    html += `<h3>Rotas</h3>${rows || '<p class="sub">Nenhuma rota.</p>'}<div class="act"><button data-a="route">Traçar rota (R)</button></div>`;
    // lotes
    html += `<h3>Lotes</h3>`;
    s.lots[id].forEach((b, lot) => {
      const place: Place = { lot }, key = placeKey(place);
      if (lot >= CITY.lots[lvl]) { html += `<div class="slot empty" id="${key}"><b>🔒 Lote ${lot + 1}</b><small class="why">Libera com a cidade nível ${CITY.lots.findIndex(n => n > lot)}</small></div>`; return; }
      if (!b) {
        html += `<div class="slot empty" id="${key}"><b>Lote livre</b><div class="act">${LOT_TYPES.map(t => button(`b:${key}:${t}`, BUILDINGS[t].name, checkBuild(s, pm, id, place, t), ` <small>${costText(buildCost(t, 1))}</small>`)).join('')}</div></div>`;
        return;
      }
      const stall = rep.stalled.find(x => x.province === id && x.lot === lot), def = BUILDINGS[b.type], made = rep.produced[`${id}:${lot}`] ?? 0;
      const status = b.remaining > 0 ? ` <small>(obra: ${b.remaining.toFixed(1)} meses)</small>`
        : stall ? ` <small class="why">${made > 0 ? `Produzindo ${made} de ${def.out[activeLevel(b)]}` : 'Parada'}: ${stall.missing === 'route' ? 'sem rota até a capital' : `falta ${esc(RES_NAMES[stall.missing])}`}</small>` : '';
      let train = '';
      if (b.type === 'garrison' && activeLevel(b) > 0) {
        const q = s.recruiting.find(r => r.province === id && r.lot === lot);
        train = q ? `<small>Treinando ${TROOPS[q.type].name.toLowerCase()}… faltam ${q.remaining.toFixed(1)} meses</small>`
          : TROOP_TYPES.map(t => button(`r:${lot}:${t}`, `${TROOP_ICON[t]} ${TROOPS[t].name}`, checkRecruit(s, pm, id, lot, t), ` <small>${costText({ ...recruitCost(s, t), months: TROOPS[t].months })}</small>`)).join('');
        // para onde vai o próximo batalhão: pela linha (reforço), para um exército parado perto, ou um exército novo
        const line = s.armies.find(a => reinforcing(s, a) === id), c = pm.provinces[id].city;
        const near = s.armies.find(a => a.owner === 0 && !a.path.length && !inBattle(s, a.id) && a.battalions.length < ARMY.maxBattalions && Math.hypot(a.x - c.x, a.y - c.y) <= 2 * ARMY.joinTiles);
        const dest = line ? `vai pela linha para o ${esc(line.name)}` : near ? `entra no ${esc(near.name)}` : 'forma um exército novo';
        train = `<div class="act">${train}</div><small class="sub">Próximo batalhão: ${dest}</small>`;
      }
      html += `<div class="slot" id="${key}"><b>${def.name} ${stars(b.level)}</b>${status}<div class="act">${upgradeButton(s, pm, id, place)}</div>${train}</div>`;
    });
    html += veinsHtml(s, pm, id, true);
  }
  show(html, id, act, focus ? placeKey(focus) : '');
}


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

// batalhões marcados para dividir ("exército:índice"); sobrevivem às re-renderizações do painel
const checked = new Set<string>();

function armiesHtml(s: GameState, pm: ProvinceMap, armies: GameState['armies']): string {
  const state = (a: (typeof armies)[0]) => (s.clock < a.routedUntil ? 'em fuga' : inBattle(s, a.id) ? 'em batalha' : a.path.length ? 'marchando' : 'parado');
  const head = `<button class="x" data-a="close">✕</button>`;
  if (armies.length > 1) {
    const rows = armies.map(a => `<div class="slot"><b>${esc(a.name)}</b> ${Math.ceil(men(a))} homens · ${a.battalions.length} batalhões<div class="sub">${state(a)}</div></div>`).join('');
    return `${head}<h2>${armies.length} exércitos</h2><div class="sub">Clique direito no mapa para mandar</div>${rows}`;
  }
  const a = armies[0];
  const sup = a.supply ? (a.supply.cut ? '<span class="why">linha de suprimento cortada</span>' : `⛽ linha de suprimento de ${esc(pm.provinces[a.supply.from].name)}`)
    : a.supplied ? 'abastecido' : `<span class="why">sem suprimento (cada batalhão perde ${SUPPLY.attrition} homem/mês)</span>`;
  const from = reinforcing(s, a);
  const reinf = from !== null ? `<div class="sub">⛽ Reforço de ${esc(pm.provinces[from].name)}: +${REINFORCE.rate} homens/mês por batalhão</div>`
    : a.supply && inBattle(s, a.id) ? '<div class="why">Sem reforço: a cidade da linha precisa estar ligada e ter Guarnição</div>' : '';
  const rows = a.battalions.map((b, i) => {
    const k = `${a.id}:${i}`;
    return `<label class="slot" style="display:block"><input type="checkbox" data-a="ck:${k}" ${checked.has(k) ? 'checked' : ''}> ${TROOP_ICON[b.type]} ${TROOPS[b.type].name} · ${Math.ceil(b.soldiers)}/${TROOPS[b.type].soldiers}</label>`;
  }).join('');
  const marked = a.battalions.map((_, i) => i).filter(i => checked.has(`${a.id}:${i}`));
  const near = s.armies.filter(o => o !== a && o.owner === 0 && Math.hypot(o.x - a.x, o.y - a.y) <= ARMY.joinTiles);
  const btn = (act: string, label: string, ok = true) => `<button data-a="${act}" ${ok ? '' : 'disabled'}>${label}</button>`;
  const lineBtn = a.supply ? btn(`ds:${a.id}`, 'Cortar linha') : btn(`sp:${a.id}`, `Abastecer <small>${RES_ICON.money}${SUPPLY.lineMoney}+/mês</small>`);
  return `${head}<h2>${esc(a.name)} <button data-a="rn:${a.id}" title="Renomear">✎</button></h2>
    <div class="sub">${Math.ceil(men(a))} homens · moral ${Math.round(a.morale * 100)}% · ${state(a)} · ${sup}</div>${reinf}
    <h3>Batalhões (${a.battalions.length}/${ARMY.maxBattalions})</h3>${rows}
    <div class="act">${btn(`sl:${a.id}:${marked.join(',')}`, `Dividir (formar exército com os marcados)`, marked.length > 0 && marked.length < a.battalions.length)}
    ${near.map(o => btn(`mg:${a.id}:${o.id}`, `Juntar com ${esc(o.name)}`)).join('')}${lineBtn}</div>
    <div class="sub">Clique direito no mapa para mandar</div>`;
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
    const a = ((e.target as HTMLElement).closest('button, input') as HTMLElement | null)?.dataset.a;
    if (!a) return;
    const parsePlace = (kind: string, i: string): Place => (kind === 'lot' ? { lot: Number(i) } : { vein: Number(i) });
    if (a === 'close') act.close();
    else if (a === 'found') act.foundCapital(id);
    else if (a === 'colonize') act.colonize(id);
    else if (a === 'upc') act.upgradeCity(id);
    else if (a === 'route') act.startRoute(id);
    else if (a.startsWith('rr:')) act.removeRoute(Number(a.slice(3)));
    else if (a.startsWith('ck:')) { const k = a.slice(3); if (checked.has(k)) checked.delete(k); else checked.add(k); }
    else if (a.startsWith('sl:')) { const [, armyId, list] = a.split(':'); act.split(Number(armyId), list ? list.split(',').map(Number) : []); for (const k of [...checked]) if (k.startsWith(`${armyId}:`)) checked.delete(k); }
    else if (a.startsWith('mg:')) { const [, into, from] = a.split(':'); act.merge(Number(into), Number(from)); }
    else if (a.startsWith('rn:')) act.rename(Number(a.slice(3)));
    else if (a.startsWith('sp:')) act.supply(Number(a.slice(3)));
    else if (a.startsWith('ds:')) act.dropSupply(Number(a.slice(3)));
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
