import { CELL } from '../../worldgen/constants';
import type { ProvinceMap } from '../../worldgen/provinces';

/**
 * Anéis fechados da borda de cada província, em tiles nos cantos de célula: `[x0,y0,x1,y1,…,x0,y0]`.
 * Externos giram num sentido e buracos no outro: preencher com 'evenodd' (ou somar as áreas com sinal).
 */
export function provinceRings(pm: ProvinceMap): number[][][] {
  const S = Math.round(Math.sqrt(pm.cellProvince.length)), cp = pm.cellProvince;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= S || y >= S ? -1 : cp[y * S + x]);
  // arestas dirigidas com o interior da província à direita (sentido horário na tela), por província: início → fins
  const edges = pm.provinces.map(() => new Map<number, number[]>());
  const V = S + 1, vid = (x: number, y: number) => y * V + x;
  const add = (p: number, a: number, b: number) => { const m = edges[p]; const l = m.get(a); if (l) l.push(b); else m.set(a, [b]); };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const p = cp[y * S + x];
    if (p < 0) continue;
    if (at(x, y - 1) !== p) add(p, vid(x, y), vid(x + 1, y));
    if (at(x + 1, y) !== p) add(p, vid(x + 1, y), vid(x + 1, y + 1));
    if (at(x, y + 1) !== p) add(p, vid(x + 1, y + 1), vid(x, y + 1));
    if (at(x - 1, y) !== p) add(p, vid(x, y + 1), vid(x, y));
  }
  return edges.map(m => {
    const rings: number[][] = [];
    for (const [start, ends] of m) while (ends.length) {
      const pts: number[] = [start];
      let cur = ends.pop()!;
      while (cur !== start) {
        pts.push(cur);
        const next = m.get(cur)!;
        cur = next.pop()!;
      }
      // tira os vértices colineares (bordas retas viram um segmento só)
      const ring: number[] = [];
      for (let i = 0; i < pts.length; i++) {
        const a = pts[(i - 1 + pts.length) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
        const ax = a % V, ay = (a / V) | 0, bx = b % V, by = (b / V) | 0, cx = c % V, cy = (c / V) | 0;
        if ((bx - ax) * (cy - by) - (by - ay) * (cx - bx) !== 0) ring.push(bx * CELL, by * CELL);
      }
      ring.push(ring[0], ring[1]);
      rings.push(ring);
    }
    return rings;
  });
}

/**
 * Fronteiras entre duas províncias de terra de grupos diferentes (costa não entra), cada trecho uma vez:
 * `[x0,y0,x1,y1,…]` em tiles. Sem `group`, cada província é o seu grupo; com o dono, saem as fronteiras nacionais.
 */
export function borderSegments(pm: ProvinceMap, group: (province: number) => number = p => p): Float32Array {
  const S = Math.round(Math.sqrt(pm.cellProvince.length)), cp = pm.cellProvince, out: number[] = [];
  const border = (a: number, b: number) => a >= 0 && b >= 0 && a !== b && group(a) !== group(b);
  // corridas seguidas na mesma linha viram um segmento só
  for (let y = 0; y < S - 1; y++) for (let x = 0; x < S; ) {
    if (!border(cp[y * S + x], cp[(y + 1) * S + x])) { x++; continue; }
    const x0 = x;
    while (x < S && border(cp[y * S + x], cp[(y + 1) * S + x])) x++;
    out.push(x0 * CELL, (y + 1) * CELL, x * CELL, (y + 1) * CELL);
  }
  for (let x = 0; x < S - 1; x++) for (let y = 0; y < S; ) {
    if (!border(cp[y * S + x], cp[y * S + x + 1])) { y++; continue; }
    const y0 = y;
    while (y < S && border(cp[y * S + x], cp[y * S + x + 1])) y++;
    out.push((x + 1) * CELL, y0 * CELL, (x + 1) * CELL, y * CELL);
  }
  return new Float32Array(out);
}
