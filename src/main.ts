import * as THREE from 'three';
import { FreeCamera } from './client/camera';
import { bordersCanvas, makePainter, ownedCanvas, provinceAtTile } from './client/view/borders';
import { BuildingsView, siteClearings } from './client/view/buildings';
import { initHud, initTopbar, setInfo, setProgress, setSeedField, setTopbar, showError } from './client/hud';
import { loadQuality, saveQuality, type Quality } from './client/quality';
import { FADE_END, StrategicMap } from './client/strategic';
import { ChunkManager } from './client/view/chunks';
import { createScene } from './client/view/scene';
import { WorldClient } from './client/worldClient';
import { build, chooseCapital, colonize, setSpeed, upgrade, type Result } from './sim/commands';
import { renderPanel, setTip, toast } from './client/panel';
import { monthlyIncome } from './sim/economy';
import { makeMoveGrid, type MoveGrid } from './sim/movegrid';
import { newGame, type GameState } from './sim/state';
import { tick } from './sim/tick';
import { CELL, CHUNK } from './worldgen/constants';
import type { ProvinceMap } from './worldgen/provinces';
import { parseSeed, randomSeed } from './worldgen/seed';
import type { WorldMap } from './worldgen/types';

const client = new WorldClient();
const viewCanvas = document.getElementById('view') as HTMLCanvasElement;
const iso = createScene(viewCanvas);
const camera = new FreeCamera(viewCanvas, () => iso.yaw(), () => iso.viewWidth());
// clique no pergaminho: centraliza a câmera ali e volta ao 3D
const strategic = new StrategicMap(document.getElementById('strategic') as HTMLCanvasElement,
  (x, y) => {
    if (!pm || !game) return;
    selected = provinceAtTile(pm, x, y);
    if (game.capital < 0) return; // escolhendo a capital: fica no mapa
    camera.center(x, y); strategic.mode = '3d'; iso.setWidth(300);
  },
  () => iso.setWidth(FADE_END - 1));
const chunks = new ChunkManager(client, iso.scene);
const buildingsView = new BuildingsView(iso.scene);
let seed = parseSeed(new URLSearchParams(location.search).get('seed')) ?? randomSeed();
let map: WorldMap | null = null;
let pm: ProvinceMap | null = null;
let game: GameState | null = null;
let moveGrid: MoveGrid | null = null;
let lastSpeed = 1;
let seenEvents = 0;
let selected = -1;
let paintKey = '', ownerKey = '', bordersLayer: HTMLCanvasElement | null = null;
let quality = loadQuality();
iso.setQuality(quality);
// raio (em chunks) que cobre a vista isométrica: o chão visto é ~1.8× mais alto que largo na tela
const viewRadius = () => Math.ceil((iso.viewWidth() * 0.9) / CHUNK) + 1;

async function load(s: number) {
  seed = s;
  setSeedField(s);
  history.replaceState(null, '', `?seed=${s}`);
  showError(null);
  map = null; pm = null; game = null; moveGrid = null; selected = -1; seenEvents = 0; lastSpeed = 1;
  strategic.setPins([]); paintKey = ''; ownerKey = ''; bordersLayer = null;
  chunks.setPainter(null);
  buildingsView.clear();
  strategic.setOverlay([], []);
  strategic.setImage(null, 0); // o pergaminho do mundo antigo some já, não só quando o novo ficar pronto
  chunks.reset();
  chunks.hidden = undefined;
  let w: { map: WorldMap; provinces: ProvinceMap };
  try { w = await client.generate(s, setProgress); }
  catch (e) { if ((e as Error).message !== 'substituído') showError((e as Error).message, s); return; }
  map = w.map; pm = w.provinces; game = newGame(pm);
  moveGrid = makeMoveGrid(map);
  chunks.hidden = siteClearings(pm);
  setProgress(null, 1);
  const m = map;
  client.parchment(2048).then(px => { if (map === m) strategic.setImage(px, 2048); }, () => {});
  bordersLayer = bordersCanvas(pm, 2048);
  const first = pm.provinces[pm.suggestedCapitals[0]] ?? pm.provinces[0];
  if (first) camera.center(first.center.x, first.center.y);
  // tela inicial: pergaminho com selos nas capitais sugeridas
  strategic.setPins(pm.suggestedCapitals.map(i => pm!.provinces[i].center));
  strategic.open(2048, 2048);
  strategic.zoomTo(4096 * 1.1);
  toast('Escolha onde fundar sua capital: clique num selo ♜');
}

const report = (r: Result) => { if (!r.ok) toast(r.reason); };
const actions = {
  colonize: (id: number) => game && pm && report(colonize(game, pm, id)),
  build: (id: number, slot: number, t: Parameters<typeof build>[4]) => game && pm && report(build(game, pm, id, slot, t)),
  upgrade: (id: number, slot: number) => game && pm && report(upgrade(game, pm, id, slot)),
  foundCapital: (id: number) => {
    if (!game || !pm) return;
    const r = chooseCapital(game, pm, id);
    report(r);
    if (!r.ok) return;
    strategic.setPins([]);
    strategic.mode = '3d';
    camera.center(pm.provinces[id].center.x, pm.provinces[id].center.y);
    iso.setWidth(140);
    toast('Capital fundada. O tempo está pausado: espaço ou 1× para começar.');
  },
  close: () => { selected = -1; },
};

function speed(v: number) {
  if (!game) return;
  setSpeed(game, v);
  if (v > 0) lastSpeed = v;
}

initHud({
  seed,
  quality,
  onQuality: q => { quality = q as Quality; saveQuality(quality); iso.setQuality(quality); },
  onGenerate: raw => load(parseSeed(raw) ?? randomSeed()),
  getLink: () => `${location.origin}${location.pathname}?seed=${seed}`,
});
initTopbar(speed);

const keys = new Set<string>();
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'm') {
    if (strategic.mode === 'map') { strategic.mode = '3d'; iso.setWidth(Math.min(400, FADE_END - 1)); }
    else strategic.open(camera.x, camera.y);
  }
  if (k === 'q') iso.rotate(-1);
  if (k === 'e') iso.rotate(1);
  if (k === ' ' && game) { e.preventDefault(); if (game.capital >= 0) speed(game.speed === 0 ? lastSpeed : 0); } // antes da capital o tempo fica parado
  if (strategic.mode !== 'map') keys.add(k); // com o mapa aberto, o teclado não move a câmera escondida
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
window.addEventListener('wheel', e => {
  if (strategic.mode === 'map') return strategic.wheel(e.deltaY);
  iso.zoom(e.deltaY);
  if (iso.viewWidth() >= FADE_END && e.deltaY > 0) strategic.open(camera.x, camera.y);
}, { passive: true });

// clique esquerdo (sem arrastar) no terreno: seleciona a província
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let down: { x: number; y: number } | null = null;
viewCanvas.addEventListener('pointerdown', e => { if (e.button === 0) down = { x: e.clientX, y: e.clientY }; });
viewCanvas.addEventListener('pointerup', e => {
  if (e.button !== 0 || !down || !pm || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
  down = null;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, iso.camera);
  const hit = ray.intersectObjects(chunks.terrainMeshes(), false)[0];
  selected = hit ? provinceAtTile(pm, hit.point.x, hit.point.z) : -1;
});

// dica ao passar o mouse: nome e dono da província (raycast limitado a ~10/s)
let tipAt = 0;
viewCanvas.addEventListener('pointermove', e => {
  const now = performance.now();
  if (!pm || !game || now - tipAt < 100) return;
  tipAt = now;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, iso.camera);
  const hit = ray.intersectObjects(chunks.terrainMeshes(), false)[0];
  const p = hit ? provinceAtTile(pm, hit.point.x, hit.point.z) : -1;
  setTip(p < 0 ? null : `${pm.provinces[p].name} · ${game.owner[p] === 0 ? 'seu reino' : 'neutra'}`, e.clientX, e.clientY);
});
viewCanvas.addEventListener('pointerleave', () => setTip(null));

let last = performance.now(), frames = 0, fps = 0, fpsT = last;
function frame(now: number) {
  const dt = (now - last) / 1000;
  last = now;
  if (map && pm && game) {
    // dono ou seleção mudou: repinta o 3D; dono mudou: refaz a aquarela do pergaminho
    const ok = game.owner.join(','), key = `${ok}|${selected}`;
    if (key !== paintKey) { paintKey = key; chunks.setPainter(makePainter(pm, game.owner, selected)); }
    if (ok !== ownerKey && bordersLayer) {
      ownerKey = ok;
      strategic.setOverlay([ownedCanvas(pm, game.owner, 1024), bordersLayer],
        pm.provinces.map(p => ({ x: p.center.x, y: p.center.y, name: p.name, size: Math.sqrt(p.cells) * CELL * 0.12 })));
    }
    if (game.capital >= 0) tick(game, pm, Math.min(dt, 1), moveGrid); // aba em segundo plano: no máximo 1 s por quadro
    camera.update(Math.min(dt, 0.1), keys);
    chunks.update(camera.x, camera.y, viewRadius(), quality);
    iso.setTarget(camera.x, camera.y, chunks.heightAt(camera.x, camera.y));
    setTopbar(game.capital >= 0 ? { res: game.res, income: monthlyIncome(game, pm), month: game.month, speed: game.speed } : null);
    setInfo({ fps, tris: iso.renderer.info.render.triangles });
    renderPanel(game, pm, selected, actions);
    buildingsView.sync(game, pm, (x, y) => chunks.heightAt(x, y));
    // eventos novos viram mensagens: compara com o total (o log só guarda os últimos 50)
    const fresh = game.eventCount - seenEvents;
    for (const ev of game.events.slice(Math.max(0, game.events.length - fresh))) toast(ev.text);
    seenEvents = game.eventCount;
  }
  // pergaminho opaco cobrindo tudo: não desenha (nem sombreia) o 3D escondido
  if (!strategic.covering) iso.render();
  strategic.draw(iso.viewWidth(), iso.yaw(), camera.x, camera.y);
  frames++;
  if (now - fpsT > 500) { fps = Math.round((frames * 1000) / (now - fpsT)); frames = 0; fpsT = now; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if (import.meta.env.DEV) { // para testes no console
  Object.assign(window, { chunks, iso, camera, strategic });
  Object.defineProperties(window, { game: { get: () => game }, pm: { get: () => pm }, selected: { get: () => selected, set: v => (selected = v) } });
}
load(seed);
