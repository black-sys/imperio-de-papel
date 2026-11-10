import { FreeCamera } from './client/camera';
import { initHud, initTopbar, setInfo, setProgress, setSeedField, setTopbar, showError } from './client/hud';
import { loadQuality, saveQuality, type Quality } from './client/quality';
import { FADE_END, StrategicMap } from './client/strategic';
import { ChunkManager } from './client/view/chunks';
import { createScene } from './client/view/scene';
import { WorldClient } from './client/worldClient';
import { setSpeed } from './sim/commands';
import { monthlyIncome } from './sim/economy';
import { newGame, type GameState } from './sim/state';
import { tick } from './sim/tick';
import { CHUNK } from './worldgen/constants';
import type { ProvinceMap } from './worldgen/provinces';
import { parseSeed, randomSeed } from './worldgen/seed';
import type { WorldMap } from './worldgen/types';

const client = new WorldClient();
const viewCanvas = document.getElementById('view') as HTMLCanvasElement;
const iso = createScene(viewCanvas);
const camera = new FreeCamera(viewCanvas, () => iso.yaw(), () => iso.viewWidth());
// clique no pergaminho: centraliza a câmera ali e volta ao 3D
const strategic = new StrategicMap(document.getElementById('strategic') as HTMLCanvasElement,
  (x, y) => { camera.center(x, y); strategic.mode = '3d'; iso.setWidth(300); },
  () => iso.setWidth(FADE_END - 1));
const chunks = new ChunkManager(client, iso.scene);
let seed = parseSeed(new URLSearchParams(location.search).get('seed')) ?? randomSeed();
let map: WorldMap | null = null;
let pm: ProvinceMap | null = null;
let game: GameState | null = null;
let lastSpeed = 1;
let quality = loadQuality();
iso.setQuality(quality);
// raio (em chunks) que cobre a vista isométrica: o chão visto é ~1.8× mais alto que largo na tela
const viewRadius = () => Math.ceil((iso.viewWidth() * 0.9) / CHUNK) + 1;

async function load(s: number) {
  seed = s;
  setSeedField(s);
  history.replaceState(null, '', `?seed=${s}`);
  showError(null);
  map = null; pm = null; game = null;
  strategic.setImage(null, 0); // o pergaminho do mundo antigo some já, não só quando o novo ficar pronto
  chunks.reset();
  let w: { map: WorldMap; provinces: ProvinceMap };
  try { w = await client.generate(s, setProgress); }
  catch (e) { if ((e as Error).message !== 'substituído') showError((e as Error).message, s); return; }
  map = w.map; pm = w.provinces; game = newGame(pm);
  setProgress(null, 1);
  const m = map;
  client.parchment(2048).then(px => { if (map === m) strategic.setImage(px, 2048); }, () => {});
  const first = pm.provinces[pm.suggestedCapitals[0]];
  camera.center(first.center.x, first.center.y);
}

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
  if (k === ' ' && game) { speed(game.speed === 0 ? lastSpeed : 0); e.preventDefault(); }
  if (strategic.mode !== 'map') keys.add(k); // com o mapa aberto, o teclado não move a câmera escondida
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
window.addEventListener('wheel', e => {
  if (strategic.mode === 'map') return strategic.wheel(e.deltaY);
  iso.zoom(e.deltaY);
  if (iso.viewWidth() >= FADE_END && e.deltaY > 0) strategic.open(camera.x, camera.y);
}, { passive: true });

let last = performance.now(), frames = 0, fps = 0, fpsT = last;
function frame(now: number) {
  const dt = (now - last) / 1000;
  last = now;
  if (map && pm && game) {
    if (game.capital >= 0) tick(game, pm, Math.min(dt, 1)); // aba em segundo plano: no máximo 1 s por quadro
    camera.update(Math.min(dt, 0.1), keys);
    chunks.update(camera.x, camera.y, viewRadius(), quality);
    iso.setTarget(camera.x, camera.y, chunks.heightAt(camera.x, camera.y));
    setTopbar(game.capital >= 0 ? { res: game.res, income: monthlyIncome(game, pm), month: game.month, speed: game.speed } : null);
    setInfo({ fps, tris: iso.renderer.info.render.triangles });
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
  Object.assign(window, { chunks, iso, camera });
  Object.defineProperties(window, { game: { get: () => game }, pm: { get: () => pm } });
}
load(seed);
