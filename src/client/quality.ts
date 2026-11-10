export type Quality = 'low' | 'medium' | 'high';

export const QUALITY: Record<Quality, { l0: number; l1: number; shadow: 0 | 1024 | 2048; flora: number; animateWater: boolean }> = {
  high: { l0: 3, l1: 7, shadow: 2048, flora: 1, animateWater: true },
  medium: { l0: 2, l1: 6, shadow: 1024, flora: 0.5, animateWater: true },
  low: { l0: 1, l1: 5, shadow: 0, flora: 0, animateWater: false },
};
export const QUALITY_NAMES: Record<Quality, string> = { low: 'Baixa', medium: 'Média', high: 'Alta' };

/** Nível de detalhe pela distância (em chunks) da câmera. */
export function lodFor(dist: number, q: Quality): 0 | 1 | 2 {
  const p = QUALITY[q];
  return dist <= p.l0 ? 0 : dist <= p.l1 ? 1 : 2;
}

export function loadQuality(): Quality {
  try {
    const v = localStorage.getItem('quality');
    return v === 'low' || v === 'medium' || v === 'high' ? v : 'high';
  } catch { return 'high'; }
}

export function saveQuality(q: Quality): void {
  try { localStorage.setItem('quality', q); } catch { /* armazenamento bloqueado: só não lembra */ }
}
