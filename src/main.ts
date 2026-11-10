import * as THREE from 'three';
import { findPath, nearestWalkable } from './client/astar';
import { initHud, setInfo, setProgress, setSeedField, showError } from './client/hud';
import { BIOME_NAMES, drawMap2d, onMapClick, setMarker } from './client/map2d';
import { Player } from './client/player';
import { ChunkManager } from './client/view/chunks';
import { createScene } from './client/view/scene';
import { WorldClient } from './client/worldClient';
import { parseSeed, randomSeed } from './worldgen/seed';
import type { Biome, WorldMap } from './worldgen/types';

const client = new WorldClient();
const viewCanvas = document.getElementById('view') as HTMLCanvasElement;
const mapCanvas = document.getElementById('map2d') as HTMLCanvasElement;
const iso = createScene(viewCanvas);
const chunks = new ChunkManager(client, iso.scene);
const player = new Player(iso.scene);
let seed = parseSeed(new URLSearchParams(location.search).get('seed')) ?? randomSeed();
let map: WorldMap | null = null;
let pendingTeleport: { x: number; y: number } | null = null;
const walk = (x: number, y: number) => chunks.walkAt(x, y);

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
  player.teleport({ x: Math.floor(m.spawn.x), y: Math.floor(m.spawn.y) });
}

initHud({
  seed,
  onGenerate: raw => load(parseSeed(raw) ?? randomSeed()),
  getLink: () => `${location.origin}${location.pathname}?seed=${seed}`,
});

// teclado: WASD relativo à câmera, Q/E giram, M abre o mapa
const keys = new Set<string>();
window.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (k === 'm') mapCanvas.classList.toggle('open');
  if (k === 'q') iso.rotate(-1);
  if (k === 'e') iso.rotate(1);
  keys.add(k);
});
window.addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
window.addEventListener('wheel', e => iso.zoom(e.deltaY), { passive: true });

// clique no terreno: anda até lá pelo A*
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
viewCanvas.addEventListener('click', e => {
  if (!map) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, iso.camera);
  const hit = ray.intersectObjects(chunks.terrainMeshes(), false)[0];
  if (!hit) return;
  const from = { x: Math.floor(player.position.x), y: Math.floor(player.position.y) };
  const path = findPath(walk, from, { x: Math.floor(hit.point.x), y: Math.floor(hit.point.z) });
  if (path) player.goTo(path); // inalcançável: não faz nada
});

// clique no mapa 2D: teleporta (espera o chunk carregar para achar chão firme)
onMapClick(mapCanvas, (x, y) => { if (map) pendingTeleport = { x, y }; });

let last = performance.now(), frames = 0, fps = 0, fpsT = last;
function frame(now: number) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (map) {
    if (pendingTeleport) {
      chunks.update(pendingTeleport.x, pendingTeleport.y);
      if (chunks.isLoaded(pendingTeleport.x, pendingTeleport.y)) {
        const t = nearestWalkable(walk, pendingTeleport.x, pendingTeleport.y);
        if (t) player.teleport(t);
        pendingTeleport = null;
      }
    }
    const fw = (keys.has('w') ? 1 : 0) - (keys.has('s') ? 1 : 0), rt = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
    const yaw = iso.yaw(), f = { x: -Math.cos(yaw), y: -Math.sin(yaw) }, r = { x: -f.y, y: f.x };
    player.moveDir(f.x * fw + r.x * rt, f.y * fw + r.y * rt);
    player.update(dt, chunks);
    const p = player.position;
    chunks.update(p.x, p.y);
    iso.setTarget(p.x, p.y, chunks.heightAt(p.x, p.y));
    setMarker(p.x, p.y);
    const b = chunks.biomeAt(p.x, p.y);
    setInfo({ x: p.x, y: p.y, biome: b === null ? '…' : BIOME_NAMES[b as Biome], fps });
  }
  iso.render();
  frames++;
  if (now - fpsT > 500) { fps = Math.round((frames * 1000) / (now - fpsT)); frames = 0; fpsT = now; }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
if (import.meta.env.DEV) Object.assign(window, { player, chunks, iso }); // para testes no console
load(seed);
