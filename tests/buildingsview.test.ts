import * as THREE from 'three';
import { expect, test } from 'vitest';
import { BuildingsView } from '../src/client/view/buildings';
import type { GameState } from '../src/sim/state';
import type { ProvinceMap } from '../src/worldgen/provinces';

test('obra em andamento não recria o grupo a cada quadro (só quando muda tipo/nível/fase)', () => {
  const scene = new THREE.Scene(), v = new BuildingsView(scene);
  const pm = { provinces: [{ sites: [{ x: 10, y: 10 }, { x: 20, y: 20 }] }] } as unknown as ProvinceMap;
  const s = { buildings: [[{ type: 'village', level: 1, remaining: 0 }, { type: 'sawmill', level: 1, remaining: 2 }]], colonizing: [] } as unknown as GameState;
  v.sync(s, pm, () => 0);
  const g = scene.children[0];
  s.buildings[0][1]!.remaining = 1.37;
  v.sync(s, pm, () => 0);
  expect(scene.children[0]).toBe(g);
  s.buildings[0][1]!.remaining = 0;
  v.sync(s, pm, () => 0);
  expect(scene.children[0]).not.toBe(g);
});
