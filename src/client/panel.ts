import { ARMY, BUILDINGS, CITY, DEPOT_MONTHS, REINFORCE, RES_NAMES, SUPPLY, TROOPS, type BuildingType, type TroopType } from '../sim/balance';
import { checkBuild, checkColonize, checkRecruit, checkUpgrade, checkUpgradeCity, type Place, type Result } from '../sim/commands';
import { buildCost, cityTax, colonizeCost, recruitCost, runMonth } from '../sim/economy';
import { activeLevel, cityLevel, playerCapital, type Bent, type GameState } from '../sim/state';
import { occupyMonths } from '../sim/conquest';
import { checkPropose, KIND_LABEL, pactBetween, relation, relationLabel } from '../sim/diplomacy';
import type { LawKind, Proposal } from '../sim/state';
import { LAW_NAME, stabilityTarget } from '../sim/stability';
import { formatDate } from './hud';
import { LAWS, REPRESS, STAB, UNREST } from '../sim/balance';
import { RES_KEYS, type Res } from '../sim/balance';
import { REALM_COLORS } from './map/pick';
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
  declareWar(nation: number): void;
  propose(to: number, p: Proposal): void;
  answer(letter: number, accept: boolean): void;
  leaveAlliance(nation: number): void;
  decree(law: LawKind): void;
  repeal(law: LawKind): void;
  repress(armyId: number): void;
  centerOn(province: number): void;
}
/** O que mais o painel pode mostrar: a lista de nações ou um exército alheio (só leitura). */
export interface PanelExtra { nations?: boolean; inspect?: number; letters?: boolean; laws?: boolean; journal?: boolean }
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
export function renderPanel(s: GameState | null, pm: ProvinceMap | null, id: number, act: PanelActions, armies: number[] = [], focus: PanelFocus = null, extra: PanelExtra = {}): void {
  const picked = s ? s.armies.filter(t => armies.includes(t.id)) : [];
  const other = s?.armies.find(a => a.id === extra.inspect && a.owner !== 0);
  if (!s || !pm || (id < 0 && picked.length === 0 && !other && !extra.nations && !extra.letters && !extra.laws && !extra.journal)) { el.style.display = 'none'; lastHtml = ''; lastFocus = ''; return; }
  if (picked.length) return show(armiesHtml(s, pm, picked), id, act, '');
  if (other) return show(foreignArmyHtml(s, other), id, act, '');
  if (id < 0 && extra.letters) return show(lettersHtml(s, pm), id, act, '');
  if (id < 0 && extra.laws) return show(lawsHtml(s), id, act, '');
  if (id < 0 && extra.journal) return show(journalHtml(s), id, act, '');
  if (id < 0) return show(nationsHtml(s, pm), id, act, '');
  const p = pm.provinces[id], mine = s.owner[id] === 0 && !!s.city[id], fort = s.fortresses.find(f => f.province === id), rival = s.owner[id] > 0 ? s.nations[s.owner[id]] : null;
  const owner = playerCapital(s) === id ? 'Sua capital' : mine ? 'Sua nação' : rival ? `${swatch(rival.id)}${esc(rival.name)}${rival.capital === id ? ' · capital' : ''}` : fort ? 'Fortaleza neutra' : 'Neutra';
  let html = `<button class="x" data-a="close">✕</button><h2>${esc(p.name)}</h2>
    <div class="sub">${owner} · ${BIOME_NAMES[p.biome]}${p.coastal ? ' · costeira' : ''}</div>
    ${bar('Fertilidade', p.fertility)}${occupationHtml(s, pm, id)}${s.owner[id] >= 0 && s.city[id] ? stabilityHtml(s, pm, id) : ''}`;
  if (playerCapital(s) < 0) {
    html += pm.suggestedCapitals.includes(id)
      ? `<p>Uma boa terra para começar. Por perto: ${esc(veinsAround(pm, id))}.</p><button class="big" data-a="found">Fundar capital aqui</button>`
      : `<p class="why">Escolha uma das províncias marcadas com o selo no mapa.</p>`;
    html += veinsHtml(s, pm, id, false);
  } else if (rival) {
    html += rivalHtml(s, pm, id, rival.id);
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
        : stall ? ` <small class="why">${made > 0 ? `Produzindo ${made} de ${def.out[activeLevel(b)]}` : 'Parada'}: ${stall.missing === 'route' ? 'sem rota até a capital' : stall.missing === 'strike' ? 'greve' : stall.missing === 'revolt' ? 'revolta' : `falta ${esc(RES_NAMES[stall.missing])}`}</small>` : '';
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

// formulário de proposta aberto no painel (paz ou comércio) e o que já foi preenchido
type Form = { kind: 'peace' | 'trade'; to: number; cede: number[]; money: number; theyPay: boolean; give: keyof Res; giveQty: number; get: keyof Res; getQty: number };
let form: Form | null = null;
const formProposal = (f: Form): Proposal => (f.kind === 'peace'
  ? { kind: 'peace', cede: f.cede, money: f.money, payer: f.theyPay ? f.to : 0 }
  : { kind: 'trade', give: [f.give, f.giveQty], get: [f.get, f.getQty] });
const PACT_ICON: Record<string, string> = { truce: '🕊', nonaggression: '🕊', trade: '⚖', alliance: '🤝' };

/** Relação, acordos em vigor e propostas possíveis com a nação `n` (do ponto de vista do jogador). */
function diplomacyHtml(s: GameState, pm: ProvinceMap, n: number): string {
  if (!s.nations[n].alive || !s.nations[0].alive) return '';
  const rel = Math.round(relation(s, 0, n)), label = relationLabel(rel);
  const pacts = s.pacts.filter(p => (p.a === 0 && p.b === n) || (p.a === n && p.b === 0)).map(p => {
    const left = p.until === null ? '' : ` (${Math.max(0, Math.ceil(p.until - s.month))} meses)`;
    const trade = p.trade ? `: damos ${tradeText(p.a === 0 ? p.trade.aGives : p.trade.bGives)} por ${tradeText(p.a === 0 ? p.trade.bGives : p.trade.aGives)}` : '';
    return `${PACT_ICON[p.kind]} ${KIND_LABEL[p.kind]}${trade}${left}`;
  });
  const chk = (p: Proposal) => checkPropose(s, pm, 0, n, p);
  const btn = (action: string, text: string, r: { ok: boolean; reason?: string }) => button(action, text, r.ok ? { ok: true } : { ok: false, reason: r.reason! });
  const white: Proposal = { kind: 'peace', cede: [], money: 0, payer: 0 };
  let html = `<div class="sub">Relação ${label} · ${rel > 0 ? '+' : ''}${rel}${pacts.length ? ` · ${pacts.join(' · ')}` : ''}</div><div class="act">`;
  // em guerra só cabe a paz; em paz, os acordos
  if (s.nations[0].atWar.includes(n)) html += btn(`pf:${n}`, 'Propor paz…', chk(white));
  else {
    html += btn(`pp:${n}:nonaggression`, 'Não agressão', chk({ kind: 'nonaggression' }));
    html += btn(`tf:${n}`, 'Comércio…', chk({ kind: 'trade', give: ['money', 1], get: ['grain', 1] }));
    html += btn(`pp:${n}:alliance`, 'Aliança', chk({ kind: 'alliance' }));
  }
  if (pactBetween(s, 0, n, 'alliance')) html += `<button data-a="lv:${n}">Desfazer aliança</button>`;
  html += warButton(s, n) + '</div>';
  if (form?.to === n) html += form.kind === 'peace' ? peaceForm(s, pm, n, form) : tradeForm(s, pm, n, form);
  return html;
}
const tradeText = ([k, q]: [keyof Res, number]) => `${RES_ICON[k]}${q} ${RES_NAMES[k]}`;

function peaceForm(s: GameState, pm: ProvinceMap, n: number, f: Form): string {
  const occ = s.occupations.filter(e => (e.nation === 0 && s.owner[e.province] === n) || (e.nation === n && s.owner[e.province] === 0));
  const rows = occ.map(e => `<label class="slot" style="display:block"><input type="checkbox" data-f="cede:${e.province}" ${f.cede.includes(e.province) ? 'checked' : ''}>
    ${esc(pm.provinces[e.province].name)} ${e.nation === 0 ? 'passa a você' : 'passa a eles'}</label>`).join('') || '<p class="sub">Nenhuma província ocupada: paz sem cessões.</p>';
  const r = checkPropose(s, pm, 0, n, formProposal(f));
  return `<h3>Proposta de paz</h3>${rows}
    <div class="slot">Indenização <input data-f="money" type="number" min="0" value="${f.money}" style="width:70px">
    <select data-f="payer"><option value="they" ${f.theyPay ? 'selected' : ''}>eles pagam</option><option value="we" ${f.theyPay ? '' : 'selected'}>nós pagamos</option></select></div>
    <div class="act">${button('fs', 'Enviar', r)}<button data-a="pf:${n}">Cancelar</button></div>`;
}

function tradeForm(s: GameState, pm: ProvinceMap, n: number, f: Form): string {
  const opts = (sel: keyof Res) => RES_KEYS.map(k => `<option value="${k}" ${k === sel ? 'selected' : ''}>${RES_NAMES[k]}</option>`).join('');
  const net = runMonth(s, pm, false).net, theirs = s.nations[n].res;
  const r = checkPropose(s, pm, 0, n, formProposal(f));
  return `<h3>Proposta de comércio (5 anos)</h3>
    <div class="slot">Damos <select data-f="give">${opts(f.give)}</select> <input data-f="giveQty" type="number" min="1" max="999" value="${f.giveQty}" style="width:56px"> /mês
      <div class="sub">nossa produção: ${net[f.give] >= 0 ? '+' : ''}${net[f.give].toFixed(1)}/mês</div></div>
    <div class="slot">Recebemos <select data-f="get">${opts(f.get)}</select> <input data-f="getQty" type="number" min="1" max="999" value="${f.getQty}" style="width:56px"> /mês
      <div class="sub">estoque deles: ${Math.floor(theirs[f.get])}</div></div>
    <div class="act">${button('fs', 'Enviar', r)}<button data-a="tf:${n}">Cancelar</button></div>`;
}

/** Caixa de cartas do jogador. */
function lettersHtml(s: GameState, pm: ProvinceMap): string {
  const text = (from: number, p: Proposal) => {
    if (p.kind === 'peace') {
      const cede = p.cede.map(id => esc(pm.provinces[id].name)).join(', ');
      const pay = p.money ? `${p.payer === from ? 'paga' : 'pede'} ${p.money} de dinheiro` : '';
      return `propõe paz${cede || pay ? ': ' : ' branca'}${[cede && `cede ${cede}`, pay].filter(Boolean).join(' e ')}`;
    }
    if (p.kind === 'trade') return `propõe comércio: ${tradeText(p.give)} por ${tradeText(p.get)} ao mês, por 5 anos`;
    return p.kind === 'nonaggression' ? 'propõe um pacto de não agressão por 5 anos' : 'propõe uma aliança defensiva';
  };
  const rows = s.letters.map(l => `<div class="slot">${swatch(l.from)}<b>${esc(s.nations[l.from].name)}</b> ${text(l.from, l.proposal)}
    <div class="sub">expira em ${Math.max(0, Math.ceil(l.expires - s.month))} meses</div>
    <div class="act"><button data-a="ly:${l.id}">Aceitar</button><button data-a="ln:${l.id}">Recusar</button></div></div>`).join('');
  return `<button class="x" data-a="close">✕</button><h2>Cartas</h2>${rows || '<p class="sub">Nenhuma carta.</p>'}`;
}

const stabilityLabel = (v: number) => (v >= 60 ? 'Estável' : v >= 40 ? 'Inquieta' : v >= 15 ? 'Tensa' : 'Em revolta');

/** Estabilidade da província: barra, rótulo, fatores do alvo, greve, revolta e ressentimento. */
function stabilityHtml(s: GameState, pm: ProvinceMap, id: number): string {
  const v = s.stability[id], { target, factors } = stabilityTarget(s, pm, id);
  const why = factors.map(([k, x]) => `${k} ${x > 0 ? '+' : ''}${Math.round(x)}`).join(' · ');
  let html = `<div class="fac"><span>Estabilidade</span><i><b style="width:${v}%;background:${v < 15 ? '#8a2a20' : v < 40 ? '#b0602a' : v < 60 ? '#b0902a' : '#4f7a3a'}"></b></i><em>${Math.round(v)}</em></div>
    <div class="sub">${stabilityLabel(v)} · tende a ${Math.round(target)} (base ${STAB.base}${why ? ` · ${why}` : ''})</div>`;
  const strike = s.strikes.find(x => x.province === id), revolt = s.revolts.find(x => x.province === id);
  if (strike) html += `<p class="why">⚙ Greve: fábricas paradas por ${Math.max(0, Math.ceil(strike.until - s.month))} meses</p>`;
  if (revolt) {
    const r = s.armies.find(a => a.id === revolt.army), capital = s.nations[s.owner[id]]?.capital === id;
    html += `<p class="why">🔥 Rebeldes: ${r?.battalions.length ?? 0} batalhões — ${capital ? 'a capital resiste até vencê-los' : `a província cai em ${Math.max(0, Math.ceil(revolt.since + UNREST.revolt.months - s.month))} meses`}</p>`;
  }
  if (s.month < s.resentment[id]) html += `<div class="sub">Ressentimento da repressão por ${Math.ceil(s.resentment[id] - s.month)} meses</div>`;
  return html;
}

/** Botão "Reprimir" do exército, desabilitado com o motivo. */
function repressButton(s: GameState, pm: ProvinceMap, a: GameState['armies'][0]): string {
  const S = Math.round(Math.sqrt(pm.cellProvince.length)), p = pm.cellProvince[Math.floor(a.y / 4) * S + Math.floor(a.x / 4)] ?? -1;
  if (p < 0 || s.owner[p] !== 0) return '';
  const why = inBattle(s, a.id) ? 'Exército em batalha' : a.path.length ? 'Exército em marcha' : s.stability[p] >= REPRESS.below ? 'Estabilidade acima de 40'
    : s.month - s.repressed[p] < REPRESS.every ? 'Reprimida há menos de 12 meses' : '';
  return button(`rp:${a.id}`, `Reprimir ${esc(pm.provinces[p].name)}`, why ? { ok: false, reason: why } : { ok: true });
}

const LAW_TEXT: Record<LawKind, string> = {
  bread: `Estabilidade +10 em todas · decretar: ${LAWS.bread.cost} de dinheiro · ${LAWS.bread.perCity} por cidade/mês`,
  ration: 'Cidades comem metade dos grãos · estabilidade −5 · a fome não pesa enquanto vigorar',
  shorter: 'Fábricas produzem 75% · a pressão das fábricas some',
  martial: `+15 onde há exército seu parado · impostos −20% · decretar: ${LAWS.martial.cost} de dinheiro`,
};
/** Leis de emergência da nação do jogador. */
function lawsHtml(s: GameState): string {
  const me = s.nations[0];
  const rows = (Object.keys(LAW_NAME) as LawKind[]).map(l => {
    const on = me.laws.includes(l), wait = (me.lawCooldown[l] ?? -Infinity) - s.month, cost = l === 'bread' ? LAWS.bread.cost : l === 'martial' ? LAWS.martial.cost : 0;
    const r = on ? { ok: true as const } : wait > 0 ? { ok: false as const, reason: `Só pode decretar de novo em ${Math.ceil(wait)} meses` } : me.res.money < cost ? { ok: false as const, reason: 'Falta dinheiro' } : { ok: true as const };
    return `<div class="slot"><b>${LAW_NAME[l]}</b>${on ? ' <small>(em vigor)</small>' : ''}<div class="sub">${LAW_TEXT[l]}</div>
      <div class="act">${on ? `<button data-a="lr:${l}">Revogar</button>` : button(`lw:${l}`, 'Decretar', r)}</div></div>`;
  }).join('');
  return `<button class="x" data-a="close">✕</button><h2>Leis de emergência</h2>${rows}`;
}

/** Últimas manchetes, da mais nova para a mais antiga. */
function journalHtml(s: GameState): string {
  const rows = [...s.headlines].reverse().map(h => `<div class="slot"><small>${formatDate(h.month)}</small><br><b>${esc(h.text)}</b></div>`).join('');
  return `<button class="x" data-a="close">✕</button><h2>Jornal</h2>${rows || '<p class="sub">Nenhuma manchete ainda.</p>'}`;
}

const BENT: Record<Bent, string> = { militarist: 'Militarista', expansionist: 'Expansionista', industrial: 'Industrial' };
const swatch = (n: number) => `<span class="swatch" style="background:${REALM_COLORS[n] ?? REALM_COLORS[0]}"></span>`;
/** Situação de uma nação vista pelo jogador. */
function situation(s: GameState, n: number): string {
  const x = s.nations[n];
  if (!x.alive) return 'eliminada';
  if (n !== 0 && x.atWar.includes(0)) return '<span class="why" style="display:inline">em guerra com você</span>';
  const foes = x.atWar.filter(k => k !== 0).map(k => esc(s.nations[k].name));
  return foes.length ? `em guerra com ${foes.join(', ')}` : n === 0 ? 'em paz' : 'em paz com você';
}
const warButton = (s: GameState, n: number) => (n !== 0 && s.nations[n].alive && !s.nations[n].atWar.includes(0) && s.nations[0].alive ? `<button data-a="dw:${n}">Declarar guerra</button>` : '');

/** Lista das nações: cor, nome (clique centraliza na capital), inclinação, províncias, batalhões e situação. */
function nationsHtml(s: GameState, pm: ProvinceMap): string {
  const rows = s.nations.map(n => {
    const prov = s.owner.filter(o => o === n.id).length, bats = s.armies.reduce((k, a) => k + (a.owner === n.id ? a.battalions.length : 0), 0);
    const name = n.alive ? `<a class="go" data-a="cn:${n.capital}">${esc(n.name)}</a>` : esc(n.name);
    return `<div class="slot">${swatch(n.id)}<b>${name}</b>${n.id === 0 ? ' (você)' : ` · ${BENT[n.bent]}`}
      <div class="sub">${prov} províncias · ${bats} batalhões · ${situation(s, n.id)}</div>${n.id === 0 ? '' : diplomacyHtml(s, pm, n.id)}</div>`;
  }).join('');
  void pm;
  return `<button class="x" data-a="close">✕</button><h2>Nações</h2>${rows}`;
}

/** Província de uma nação rival: só informação, e a declaração de guerra. */
function rivalHtml(s: GameState, pm: ProvinceMap, id: number, n: number): string {
  const lvl = cityLevel(s, id), names = [...s.lots[id], ...s.veins[id]].filter(b => b).map(b => `${BUILDINGS[b!.type].name} ${stars(b!.level)}`);
  const here = s.armies.filter(a => a.owner >= 0 && a.owner !== 0 && Math.hypot(a.x - pm.provinces[id].city.x, a.y - pm.provinces[id].city.y) <= 40);
  return `<p>${BENT[s.nations[n].bent]} · ${situation(s, n)}</p>
    <h3>Cidade</h3><div class="slot">${['', 'Vila', 'Cidade', 'Metrópole'][lvl]} ${stars(lvl)}</div>
    <h3>Prédios</h3><div class="slot">${names.join(', ') || 'nenhum'}</div>
    <h3>Exércitos perto da cidade</h3><div class="slot">${here.map(a => `${esc(a.name)}: ${Math.ceil(men(a))} homens, ${a.battalions.length} batalhões`).join('<br>') || 'nenhum'}</div>
    ${diplomacyHtml(s, pm, n)}`;
}

/** Ocupação em andamento na província: quem ocupa e quanto falta. */
function occupationHtml(s: GameState, pm: ProvinceMap, id: number): string {
  const e = s.occupations.find(x => x.province === id);
  if (!e) return '';
  const left = Math.max(0, occupyMonths(s, id) - e.progress).toFixed(1);
  const g = Math.max(0, ...s.lots[id].map(b => (b?.type === 'garrison' ? activeLevel(b) : 0)));
  if (e.nation === 0) return `<p>⚑ Você ocupa — cai em ${left} meses${g ? ` (Guarnição N${g} alonga)` : ''}</p>`;
  return `<p class="why">⚑ Ocupada pela ${esc(s.nations[e.nation].name)} — cai em ${left} meses</p>`;
}

/** Exército de outra nação ou de fortaleza: só leitura. */
function foreignArmyHtml(s: GameState, a: GameState['armies'][0]): string {
  const who = a.owner === -1 ? (a.home < 0 ? 'Rebeldes' : 'Fortaleza neutra') : `${swatch(a.owner)}${esc(s.nations[a.owner].name)}`;
  const rows = a.battalions.map(b => `<div class="slot">${TROOP_ICON[b.type]} ${TROOPS[b.type].name} · ${Math.ceil(b.soldiers)}/${TROOPS[b.type].soldiers}</div>`).join('');
  return `<button class="x" data-a="close">✕</button><h2>${esc(a.name)}</h2>
    <div class="sub">${who} · ${Math.ceil(men(a))} homens · moral ${Math.round(a.morale * 100)}%${inBattle(s, a.id) ? ' · em batalha' : ''}</div>
    <h3>Batalhões (${a.battalions.length})</h3>${rows}`;
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
    ${near.map(o => btn(`mg:${a.id}:${o.id}`, `Juntar com ${esc(o.name)}`)).join('')}${lineBtn}${repressButton(s, pm, a)}</div>
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
  // os campos dos formulários guardam o que foi digitado (o painel se refaz com o tempo correndo)
  el.oninput = e => {
    const f = (e.target as HTMLElement).dataset.f, v = (e.target as HTMLInputElement | HTMLSelectElement).value;
    if (!f || !form) return;
    if (f === 'money') form.money = Math.max(0, Math.floor(Number(v) || 0));
    else if (f === 'payer') form.theyPay = v === 'they';
    else if (f === 'give' || f === 'get') form[f] = v as keyof Res;
    else if (f === 'giveQty' || f === 'getQty') form[f] = Math.floor(Number(v) || 0);
    else if (f.startsWith('cede:')) { const id = Number(f.slice(5)); form.cede = (e.target as HTMLInputElement).checked ? [...form.cede, id] : form.cede.filter(x => x !== id); }
  };
  el.onpointerdown = e => {
    if (e.button !== 0) return;
    const a = ((e.target as HTMLElement).closest('button, input, a') as HTMLElement | null)?.dataset.a;
    if (!a) return;
    const parsePlace = (kind: string, i: string): Place => (kind === 'lot' ? { lot: Number(i) } : { vein: Number(i) });
    if (a === 'close') act.close();
    else if (a === 'found') act.foundCapital(id);
    else if (a === 'colonize') act.colonize(id);
    else if (a === 'upc') act.upgradeCity(id);
    else if (a === 'route') act.startRoute(id);
    else if (a.startsWith('rr:')) act.removeRoute(Number(a.slice(3)));
    else if (a.startsWith('dw:')) act.declareWar(Number(a.slice(3)));
    else if (a.startsWith('pp:')) { const [, n, kind] = a.split(':'); act.propose(Number(n), { kind } as Proposal); }
    else if (a.startsWith('lv:')) act.leaveAlliance(Number(a.slice(3)));
    else if (a.startsWith('lw:')) act.decree(a.slice(3) as LawKind);
    else if (a.startsWith('lr:')) act.repeal(a.slice(3) as LawKind);
    else if (a.startsWith('rp:')) act.repress(Number(a.slice(3)));
    else if (a.startsWith('ly:')) act.answer(Number(a.slice(3)), true);
    else if (a.startsWith('ln:')) act.answer(Number(a.slice(3)), false);
    else if (a.startsWith('pf:') || a.startsWith('tf:')) { const n = Number(a.slice(3)); form = form?.to === n && form.kind === (a[0] === 'p' ? 'peace' : 'trade') ? null : { kind: a[0] === 'p' ? 'peace' : 'trade', to: n, cede: [], money: 0, theyPay: true, give: 'iron', giveQty: 10, get: 'money', getQty: 20 }; }
    else if (a === 'fs' && form) { act.propose(form.to, formProposal(form)); form = null; }
    else if (a.startsWith('cn:')) act.centerOn(Number(a.slice(3)));
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
