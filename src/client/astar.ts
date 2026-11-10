export interface Pt { x: number; y: number }
type Walk = (x: number, y: number) => number; // 0 bloqueado, 1 normal, 2 lento

const SQRT2 = Math.SQRT2;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** A* 8-direções em tiles; vau custa ×2; não corta quinas. null se inalcançável ou fora do raio. */
export function findPath(walk: Walk, from: Pt, to: Pt, maxRadius = 64): Pt[] | null {
  if (walk(to.x, to.y) === 0) return null;
  if (Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y)) > maxRadius) return null;
  const R = maxRadius, W = 2 * R + 1;
  const idx = (x: number, y: number) => (y - from.y + R) * W + (x - from.x + R);
  const g = new Float64Array(W * W).fill(Infinity), parent = new Int32Array(W * W).fill(-1), closed = new Uint8Array(W * W);
  const h = (x: number, y: number) => { const dx = Math.abs(x - to.x), dy = Math.abs(y - to.y); return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy); };
  const heap: [number, number][] = []; // [f, idx]
  const push = (f: number, i: number) => { heap.push([f, i]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= f) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
  const pop = () => { const top = heap[0], last = heap.pop()!; if (heap.length) { heap[0] = last; let p = 0; for (;;) { let c = 2 * p + 1; if (c >= heap.length) break; if (c + 1 < heap.length && heap[c + 1][0] < heap[c][0]) c++; if (heap[c][0] >= heap[p][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; p = c; } } return top; };
  const s = idx(from.x, from.y);
  g[s] = 0; push(h(from.x, from.y), s);
  const goal = idx(to.x, to.y);
  while (heap.length) {
    const [, i] = pop();
    if (closed[i]) continue;
    closed[i] = 1;
    if (i === goal) break;
    const x = (i % W) - R + from.x, y = Math.floor(i / W) - R + from.y;
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (Math.abs(nx - from.x) > R || Math.abs(ny - from.y) > R) continue;
      const w = walk(nx, ny);
      if (w === 0 || (dx && dy && (walk(x + dx, y) === 0 || walk(x, y + dy) === 0))) continue;
      const n = idx(nx, ny), cost = g[i] + (dx && dy ? SQRT2 : 1) * (w === 2 ? 2 : 1);
      if (cost < g[n]) { g[n] = cost; parent[n] = i; push(cost + h(nx, ny), n); }
    }
  }
  if (!closed[goal]) return null;
  const path: Pt[] = [];
  for (let i = goal; i !== -1; i = parent[i]) path.push({ x: (i % W) - R + from.x, y: Math.floor(i / W) - R + from.y });
  return path.reverse();
}

/** Tile andável mais próximo, buscando em anéis crescentes. */
export function nearestWalkable(walk: Walk, x: number, y: number, maxR = 32): Pt | null {
  for (let r = 0; r <= maxR; r++) {
    let best: Pt | null = null, bd = Infinity;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const tx = x + dx, ty = y + dy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r || walk(tx, ty) === 0) continue;
      // chão firme: ≥3 vizinhos andáveis, para não cair numa ilhota de 1 tile
      if ((walk(tx + 1, ty) ? 1 : 0) + (walk(tx - 1, ty) ? 1 : 0) + (walk(tx, ty + 1) ? 1 : 0) + (walk(tx, ty - 1) ? 1 : 0) < 3) continue;
      const d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = { x: x + dx, y: y + dy }; }
    }
    if (best) return best;
  }
  return null;
}
