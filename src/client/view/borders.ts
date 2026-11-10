import { CELL, WORLD_TILES } from '../../worldgen/constants';
import type { ProvinceMap } from '../../worldgen/provinces';
import type { Painter } from './terrainMesh';

export const REALM_COLOR: [number, number, number] = [178, 52, 40]; // carmim do jogador

export function provinceAtTile(pm: ProvinceMap, tx: number, ty: number): number {
  if (tx < 0 || ty < 0 || tx >= WORLD_TILES || ty >= WORLD_TILES) return -1;
  const S = WORLD_TILES / CELL;
  return pm.cellProvince[Math.floor(ty / CELL) * S + Math.floor(tx / CELL)];
}

const OWNED: [number, number, number] = [1.12, 0.88, 0.84];
const BORDER: [number, number, number] = [0.55, 0.47, 0.38];
const OWNED_BORDER: [number, number, number] = [0.85, 0.35, 0.28];
const SELECTED: [number, number, number] = [1.18, 1.15, 1.05];
const SELECTED_BORDER: [number, number, number] = [1.45, 1.25, 0.6];

/** Tinta por bloco: suas províncias puxadas para a cor do reino, faixa de fronteira escura (L0/L1), selecionada mais clara. */
export function makePainter(pm: ProvinceMap, owner: number[], selected: number): Painter {
  return (tx, ty, step) => {
    const p = provinceAtTile(pm, tx, ty);
    if (p < 0) return null;
    const border = step <= 2 && [[step, 0], [-step, 0], [0, step], [0, -step]].some(([dx, dy]) => {
      const q = provinceAtTile(pm, tx + dx, ty + dy);
      return q >= 0 && q !== p;
    });
    if (p === selected) return border ? SELECTED_BORDER : SELECTED;
    if (owner[p] === 0) return border ? OWNED_BORDER : OWNED;
    return border ? BORDER : null;
  };
}

/** Fronteiras tracejadas em sépia para o pergaminho (canvas transparente size×size). */
export function bordersCanvas(pm: ProvinceMap, size: number): HTMLCanvasElement {
  const c = document.createElement('canvas'), g = c.getContext('2d')!;
  c.width = c.height = size;
  const img = g.createImageData(size, size), k = WORLD_TILES / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const p = provinceAtTile(pm, x * k, y * k);
    if (p < 0) continue;
    const q = [provinceAtTile(pm, (x + 1) * k, y * k), provinceAtTile(pm, x * k, (y + 1) * k)];
    if (!q.some(v => v >= 0 && v !== p)) continue;
    if (((x + y) >> 2) % 3 === 2) continue; // tracejado
    const o = (y * size + x) * 4;
    img.data[o] = 92; img.data[o + 1] = 60; img.data[o + 2] = 34; img.data[o + 3] = 200;
  }
  g.putImageData(img, 0, 0);
  return c;
}

/** Aquarela das suas províncias (canvas transparente). */
export function ownedCanvas(pm: ProvinceMap, owner: number[], size: number): HTMLCanvasElement {
  const c = document.createElement('canvas'), g = c.getContext('2d')!;
  c.width = c.height = size;
  const img = g.createImageData(size, size), k = WORLD_TILES / size;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const p = provinceAtTile(pm, x * k, y * k);
    if (p < 0 || owner[p] !== 0) continue;
    const o = (y * size + x) * 4, n = ((x * 7 + y * 13) % 11) / 11; // grão de aquarela
    img.data[o] = REALM_COLOR[0]; img.data[o + 1] = REALM_COLOR[1]; img.data[o + 2] = REALM_COLOR[2]; img.data[o + 3] = 70 + n * 30;
  }
  g.putImageData(img, 0, 0);
  return c;
}
