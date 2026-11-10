import { drawMap2d, BIOME_NAMES, setMarker } from './client/map2d';
import { initHud, setInfo, setProgress, setSeedField, showError } from './client/hud';
import { ChunkManager } from './client/view/chunks';
import { createScene } from './client/view/scene';
import { WorldClient } from './client/worldClient';
import { parseSeed, randomSeed } from './worldgen/seed';
import type { Biome, WorldMap } from './worldgen/types';

const client = new WorldClient();
const mapCanvas = document.getElementById('map2d') as HTMLCanvasElement;
const iso = createScene(document.getElementById('view') as HTMLCanvasElement);
const chunks = new ChunkManager(client, iso.scene);
let seed = parseSeed(new URLSearchParams(location.search).get('seed')) ?? randomSeed();
let map: WorldMap | null = null;
const cam = { x: 0, y: 0 };

async function load(s: number) {
  seed = s;
  setSeedField(s);
  history.replaceState(null, '', `?seed=${s}`);
  showError(null);
  map = null;
  chunks.reset();
  let m: WorldMap;
  try { m = await client.generate(s, setProgress); }
  catch (e) { if ((e as Error).message !== 'substituído') showError((e as Error).message, s); return; }
  map = m;
  setProgress(null, 1);
  drawMap2d(mapCanvas, m);
  cam.x = m.spawn.x; cam.y = m.spawn.y;
}

initHud({
  seed,
  onGenerate: raw => load(parseSeed(raw) ?? randomSeed()),
  getLink: () => `${location.origin}${location.pathname}?seed=${seed}`,
});

const keys = new Set<string>();
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'm') mapCanvas.classList.toggle('open');
  if (k === 'q') iso.rotate(-1);
  if (k === 'e') iso.rotate(1);
  keys.add(e.key);
});
window.addEventListener('keyup', e => keys.delete(e.key));
window.addEventListener('wheel', e => iso.zoom(e.deltaY), { passive: true });

let last = performance.now(), frames = 0, fps = 0, fpsT = last;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  // shortcut: setas movem a câmera até o personagem existir (Task 13)
  const sp = 30 * dt;
  if (keys.has('ArrowLeft')) cam.x -= sp; if (keys.has('ArrowRight')) cam.x += sp;
  if (keys.has('ArrowUp')) cam.y -= sp; if (keys.has('ArrowDown')) cam.y += sp;
  if (map) {
    chunks.update(cam.x, cam.y);
    iso.setTarget(cam.x, cam.y, chunks.heightAt(cam.x, cam.y));
    setMarker(cam.x, cam.y);
    const b = chunks.biomeAt(cam.x, cam.y);
    setInfo({ x: cam.x, y: cam.y, biome: b === null ? '…' : BIOME_NAMES[b as Biome], fps });
  }
  iso.render();
  frames++;
  if (now - fpsT > 500) { fps = Math.round((frames * 1000) / (now - fpsT)); frames = 0; fpsT = now; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if (import.meta.env.DEV) Object.assign(window, { cam, chunks }); // para testes no console
load(seed);
