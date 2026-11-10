import { drawMap2d } from './client/map2d';
import { initHud, setProgress, setSeedField, showError } from './client/hud';
import { WorldClient } from './client/worldClient';
import { parseSeed, randomSeed } from './worldgen/seed';
import type { WorldMap } from './worldgen/types';

const client = new WorldClient();
const mapCanvas = document.getElementById('map2d') as HTMLCanvasElement;
let seed = parseSeed(new URLSearchParams(location.search).get('seed')) ?? randomSeed();

async function load(s: number) {
  seed = s;
  setSeedField(s);
  history.replaceState(null, '', `?seed=${s}`);
  showError(null);
  let map: WorldMap;
  try { map = await client.generate(s, setProgress); }
  catch (e) { if ((e as Error).message !== 'substituído') showError((e as Error).message, s); return; }
  setProgress(null, 1);
  drawMap2d(mapCanvas, map);
  mapCanvas.classList.add('open');
}

initHud({
  seed,
  onGenerate: raw => load(parseSeed(raw) ?? randomSeed()),
  getLink: () => `${location.origin}${location.pathname}?seed=${seed}`,
});
window.addEventListener('keydown', e => { if (e.key === 'm' || e.key === 'M') mapCanvas.classList.toggle('open'); });
load(seed);
