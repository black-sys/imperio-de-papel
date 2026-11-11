import { initHud, initTopbar, setInfo, setProgress, setSeedField, setTopbar, showError } from './client/hud';
import { MapRenderer } from './client/map/renderer';
import { pickAt, provinceAtTile, troopsInRect } from './client/map/pick';
import { TileCache } from './client/map/tileCache';
import { clampView, minScale, toWorld, zoomAt, type View } from './client/map/view';
import { costText } from './client/labels';
import { renderPanel, setTip, toast, veinsAround, type PanelFocus } from './client/panel';
import { WorldClient } from './client/worldClient';
import { build, chooseCapital, colonize, moveTroops, recruit, setSpeed, upgrade, upgradeCity, type Place, type Result } from './sim/commands';
import { runMonth } from './sim/economy';
import { addFortress, placeFortresses } from './sim/fortress';
import { buildRoute, dropSupply, planRoute, removeRoute, supplyTroop } from './sim/routes';
import { makeMoveGrid, type MoveGrid } from './sim/movegrid';
import { newGame, type GameState } from './sim/state';
import { tick } from './sim/tick';
import { spawnTroop, troopCap } from './sim/troops';
import type { ProvinceMap } from './worldgen/provinces';
import { parseSeed, randomSeed } from './worldgen/seed';

const client = new WorldClient();
const canvas = document.getElementById('map') as HTMLCanvasElement;
const renderer = new MapRenderer(canvas);
const tiles = new TileCache((L, x, y) => client.tile(L, x, y));
const selectedTroops = new Set<number>();
const groups = new Map<string, number[]>(); // Shift+1–9 salva, 1–9 chama
let view: View = clampView({ cx: 2048, cy: 2048, scale: 0, w: innerWidth, h: innerHeight });
let lastClose: View | null = null; // última vista de perto (tecla M)
let seed = parseSeed(new URLSearchParams(location.search).get('seed')) ?? randomSeed();
let pm: ProvinceMap | null = null;
let game: GameState | null = null;
let moveGrid: MoveGrid | null = null;
let pins: { x: number; y: number; province: number }[] = [];
let lastSpeed = 1, seenEvents = 0, selected = -1, focus: PanelFocus = null;
// modo traçar rota: cidade de origem e a prévia sob o mouse
let routeFrom: number | null = null, preview: { path: number[]; ok: boolean } | null = null, previewAt = 0;

async function load(s: number) {
  seed = s;
  setSeedField(s);
  history.replaceState(null, '', `?seed=${s}`);
  showError(null);
  pm = null; game = null; moveGrid = null; pins = []; selected = -1; seenEvents = 0; lastSpeed = 1; lastClose = null;
  groups.clear(); selectedTroops.clear(); routeFrom = null; preview = null;
  tiles.clear(); renderer.setWorld(null, null);
  let w: { provinces: ProvinceMap; map: Parameters<typeof makeMoveGrid>[0] };
  try { w = await client.generate(s, setProgress); }
  catch (e) { if ((e as Error).message !== 'substituído') showError((e as Error).message, s); return; }
  pm = w.provinces; game = newGame(pm);
  moveGrid = makeMoveGrid(w.map);
  placeFortresses(game, pm, s);
  setProgress(null, 1);
  renderer.setWorld(pm, tiles);
  // tela inicial: continente inteiro com selos nas capitais sugeridas
  pins = pm.suggestedCapitals.map(i => ({ ...pm!.provinces[i].center, province: i }));
  view = clampView({ ...view, scale: 0 }); // 0 = zoom mínimo desta tela
  toast('Escolha onde fundar sua capital: clique num selo ♜');
}

const report = (r: Result) => { if (!r.ok) toast(r.reason); };
/** Seleciona tropas; com Shift soma (ou tira, se já estavam todas). */
function pickTroops(ids: number[], add: boolean): void {
  if (!add) selectedTroops.clear();
  const all = add && ids.every(id => selectedTroops.has(id));
  for (const id of ids) all ? selectedTroops.delete(id) : selectedTroops.add(id);
}
function order(x: number, y: number): void {
  if (game && moveGrid && selectedTroops.size) report(moveTroops(game, moveGrid, [...selectedTroops], x, y));
}
const actions = {
  colonize: (id: number) => game && pm && report(colonize(game, pm, id)),
  build: (id: number, place: Place, t: Parameters<typeof build>[4]) => game && pm && report(build(game, pm, id, place, t)),
  upgrade: (id: number, place: Place) => game && pm && report(upgrade(game, pm, id, place)),
  upgradeCity: (id: number) => game && pm && report(upgradeCity(game, pm, id)),
  recruit: (id: number, slot: number, t: Parameters<typeof recruit>[4]) => game && pm && report(recruit(game, pm, id, slot, t)),
  foundCapital: (id: number) => {
    if (!game || !pm) return;
    const r = chooseCapital(game, pm, id);
    report(r);
    if (!r.ok) return;
    pins = [];
    const c = pm.provinces[id].center;
    view = clampView({ ...view, cx: c.x, cy: c.y, scale: 1.5 });
    toast('Capital fundada. O tempo está pausado: espaço ou 1× para começar.');
  },
  close: () => { selected = -1; focus = null; selectedTroops.clear(); routeFrom = null; preview = null; },
  startRoute: (id: number) => { routeFrom = id; preview = null; toast('Clique noutra cidade sua · Esc cancela'); },
  removeRoute: (routeId: number) => game && report(removeRoute(game, routeId)),
  supply: (troopId: number) => game && pm && moveGrid && report(supplyTroop(game, pm, moveGrid, troopId)),
  dropSupply: (troopId: number) => game && report(dropSupply(game, troopId)),
};

function speed(v: number) {
  if (!game) return;
  setSpeed(game, v);
  if (v > 0) lastSpeed = v;
}

initHud({
  seed,
  onGenerate: raw => load(parseSeed(raw) ?? randomSeed()),
  getLink: () => `${location.origin}${location.pathname}?seed=${seed}`,
});
initTopbar(speed);

// ---- teclado ----
const keys = new Set<string>();
window.addEventListener('keydown', e => {
  if (e.target instanceof HTMLInputElement) return;
  const k = e.key.toLowerCase();
  if (k === 'm') {
    // alterna entre o continente e a última vista de perto
    if (view.scale > minScale(view) * 1.01) { lastClose = view; view = clampView({ ...view, scale: 0 }); }
    else if (lastClose) view = clampView({ ...lastClose, w: view.w, h: view.h });
  }
  if (k === 'escape') { selectedTroops.clear(); routeFrom = null; preview = null; }
  if (k === 'r' && game && selected >= 0 && game.owner[selected] === 0 && game.city[selected]) actions.startRoute(selected);
  if (/^Digit[1-9]$/.test(e.code) && game) {
    if (e.shiftKey) groups.set(e.code, [...selectedTroops]);
    else pickTroops((groups.get(e.code) ?? []).filter(id => game!.troops.some(t => t.id === id)), false);
  }
  if (k === ' ' && game) { e.preventDefault(); if (game.capital >= 0) speed(game.speed === 0 ? lastSpeed : 0); } // antes da capital o tempo fica parado
  keys.add(k);
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
window.addEventListener('resize', () => { view = clampView({ ...view, w: innerWidth, h: innerHeight }); });

// ---- mouse ----
// esquerdo: clique seleciona tropa (prioridade) ou província; arrastar desenha a caixa de seleção
// meio/direito: arrastar move o mapa; direito sem arrastar manda as tropas selecionadas
let down: { x: number; y: number } | null = null, box: [number, number, number, number] | null = null;
let drag: { x: number; y: number; sx: number; sy: number; button: number } | null = null;
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  canvas.setPointerCapture(e.pointerId);
  if (e.button === 0) down = { x: e.clientX, y: e.clientY };
  if (e.button === 1 || e.button === 2) drag = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, button: e.button };
});
canvas.addEventListener('pointermove', e => {
  if (drag) {
    view = clampView({ ...view, cx: view.cx - (e.clientX - drag.x) / view.scale, cy: view.cy - (e.clientY - drag.y) / view.scale });
    drag.x = e.clientX; drag.y = e.clientY;
  }
  if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) box = [Math.min(down.x, e.clientX), Math.min(down.y, e.clientY), Math.max(down.x, e.clientX), Math.max(down.y, e.clientY)];
  tip(e);
});
canvas.addEventListener('pointerup', e => {
  if (drag && e.button === drag.button) {
    const still = Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) <= 5;
    drag = null;
    if (still && e.button === 2) { if (routeFrom !== null) { routeFrom = null; preview = null; } else order(...toWorld(view, e.clientX, e.clientY)); }
    return;
  }
  if (e.button !== 0 || !down || !pm || !game) return;
  const b = box;
  down = null; box = null;
  if (b) return pickTroops(troopsInRect(game, view, b[0], b[1], b[2], b[3]), e.shiftKey);
  const hit = pickAt(game, pm, view, e.clientX, e.clientY, true, pins);
  if (routeFrom !== null) { // modo traçar rota: o clique numa cidade sua confirma; fora dela, sai do modo
    if (hit && hit.kind !== 'troop' && game.owner[hit.province] === 0 && hit.province !== routeFrom && moveGrid) report(buildRoute(game, pm, moveGrid, routeFrom, hit.province));
    routeFrom = null; preview = null;
    return;
  }
  if (hit?.kind === 'troop') return pickTroops([hit.id], e.shiftKey);
  if (e.shiftKey) return;
  selectedTroops.clear();
  selected = hit ? hit.province : -1;
  focus = hit?.kind === 'lot' ? { lot: hit.lot } : hit?.kind === 'vein' ? { vein: hit.vein } : null;
});
canvas.addEventListener('pointercancel', () => { down = null; box = null; drag = null; });
canvas.addEventListener('wheel', e => { e.preventDefault(); view = zoomAt(view, e.clientX, e.clientY, e.deltaY > 0 ? 1 / 1.15 : 1.15); }, { passive: false });

// dica ao passar o mouse: nome e dono da província (no máximo ~10/s)
let tipAt = 0;
function tip(e: PointerEvent) {
  const now = performance.now();
  if (!pm || !game || now - tipAt < 100) return;
  tipAt = now;
  if (routeFrom !== null && moveGrid) { // prévia da rota até a cidade sob o mouse
    const p = provinceAtTile(pm, ...toWorld(view, e.clientX, e.clientY));
    if (p < 0 || p === routeFrom || game.owner[p] !== 0) { preview = null; return setTip('Clique noutra cidade sua · Esc cancela', e.clientX, e.clientY); }
    const plan = planRoute(game, pm, moveGrid, routeFrom, p);
    preview = plan.ok ? { path: plan.path, ok: true } : null;
    return setTip(plan.ok ? `Rota até ${pm.provinces[p].name}: ${costText({ ...plan.cost, months: plan.months })}` : plan.reason, e.clientX, e.clientY);
  }
  // selo de capital sugerida: o que há por perto (é assim que se escolhe onde fundar)
  const pin = game.capital < 0 ? pins.find(q => { const [sx, sy] = [(q.x - view.cx) * view.scale + view.w / 2, (q.y - view.cy) * view.scale + view.h / 2]; return Math.hypot(sx - e.clientX, sy - e.clientY) <= 13; }) : undefined;
  if (pin) return setTip(`${pm.provinces[pin.province].name}: ${veinsAround(pm, pin.province)}`, e.clientX, e.clientY);
  const p = provinceAtTile(pm, ...toWorld(view, e.clientX, e.clientY));
  setTip(p < 0 ? null : `${pm.provinces[p].name} · ${game.owner[p] === 0 ? 'seu reino' : game.fortresses.some(f => f.province === p) ? 'fortaleza neutra' : 'neutra'}`, e.clientX, e.clientY);
}
canvas.addEventListener('pointerleave', () => setTip(null));

// ---- quadro ----
let last = performance.now(), frames = 0, fps = 0, fpsT = last;
function frame(now: number) {
  const dt = (now - last) / 1000;
  last = now;
  // WASD/setas: velocidade constante em px de tela
  const fw = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
  const rt = (keys.has('d') || keys.has('arrowright') ? 1 : 0) - (keys.has('a') || keys.has('arrowleft') ? 1 : 0);
  if (fw || rt) { const step = (900 * Math.min(dt, 0.1)) / view.scale; view = clampView({ ...view, cx: view.cx + rt * step, cy: view.cy - fw * step }); }
  if (pm && game) {
    if (game.capital >= 0) tick(game, pm, Math.min(dt, 1), moveGrid); // aba em segundo plano: no máximo 1 s por quadro
    for (const id of selectedTroops) if (!game.troops.some(t => t.id === id)) selectedTroops.delete(id); // mortas saem da seleção
    setTopbar(game.capital >= 0 ? { res: game.res, report: runMonth(game, pm, false), month: game.month, speed: game.speed,
      troops: `${game.troops.filter(t => t.owner === 0).length + game.recruiting.length}/${troopCap(game)}`,
      depot: game.depot.reduce((a, d) => { for (const k of Object.keys(a) as (keyof typeof a)[]) a[k] += d[k]; return a; }, { money: 0, grain: 0, wood: 0, coal: 0, iron: 0, steel: 0, arms: 0 }) } : null);
    renderPanel(game, pm, selected, actions, [...selectedTroops], focus);
    // eventos novos viram mensagens: compara com o total (o log só guarda os últimos 50)
    const fresh = game.eventCount - seenEvents;
    for (const ev of game.events.slice(Math.max(0, game.events.length - fresh))) toast(ev.text);
    seenEvents = game.eventCount;
  }
  canvas.style.cursor = routeFrom !== null ? 'copy' : 'crosshair';
  renderer.draw(game, view, { selectedTroops, selectedProvince: selected, pins, grid: moveGrid, preview }, box);
  setInfo({ fps });
  frames++;
  if (now - fpsT > 500) { fps = Math.round((frames * 1000) / (now - fpsT)); frames = 0; fpsT = now; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if (import.meta.env.DEV) { // para testes no console
  Object.assign(window, { renderer, tiles, selectedTroops, sim: { recruit, moveTroops, spawnTroop, addFortress, chooseCapital, planRoute } });
  Object.defineProperties(window, {
    game: { get: () => game }, pm: { get: () => pm }, moveGrid: { get: () => moveGrid },
    selected: { get: () => selected, set: v => (selected = v) }, view: { get: () => view, set: v => (view = clampView(v)) },
  });
}
load(seed);
