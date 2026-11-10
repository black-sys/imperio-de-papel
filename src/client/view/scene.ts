import * as THREE from 'three';
import { CHUNK } from '../../worldgen/constants';
import { QUALITY, type Quality } from '../quality';
import { waterUniforms } from './water';

const PITCH = (35.264 * Math.PI) / 180;
export const MIN_W = 20, MAX_W = 600;

export interface IsoScene {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  setTarget(x: number, z: number, y?: number): void;
  rotate(dir: 1 | -1): void;
  zoom(delta: number): void;
  /** Largura da vista em tiles. */
  viewWidth(): number;
  setWidth(w: number): void;
  /** Ângulo de giro atual (rad) — usado para WASD relativo à câmera. */
  yaw(): number;
  render(): void;
  setQuality(q: Quality): void;
}

export function createScene(canvas: HTMLCanvasElement): IsoScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const SKY = 0xb9d3e6;
  scene.background = skyGradient();
  scene.fog = new THREE.Fog(SKY, 1, 2);
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x4a3f30, 1.1));
  const SUN_DIR = new THREE.Vector3(-0.5, 1, -0.3).normalize();
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.0);
  scene.add(sun, sun.target);
  let quality: Quality = 'high';
  const applyShadows = () => {
    const p = QUALITY[quality];
    renderer.shadowMap.enabled = p.shadow > 0;
    sun.castShadow = p.shadow > 0;
    if (p.shadow > 0) {
      const half = (p.l0 + 1) * CHUNK; // cobre a área L0
      Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: 2000 });
      sun.shadow.camera.updateProjectionMatrix();
      sun.shadow.mapSize.set(p.shadow, p.shadow);
      sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
      sun.shadow.map?.dispose(); sun.shadow.map = null as never;
    }
    waterUniforms.uAnim.value = p.animateWater ? 1 : 0;
    scene.traverse(o => { const m = (o as THREE.Mesh).material as THREE.Material | undefined; if (m) m.needsUpdate = true; });
  };
  applyShadows();

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000);
  let width = 40, k = 0, yawAnim = Math.PI / 4;
  const target = new THREE.Vector3();
  const resize = () => {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h, false);
    const half = width / 2;
    camera.left = -half; camera.right = half; camera.top = half * (h / w); camera.bottom = -half * (h / w);
    camera.updateProjectionMatrix();
  };
  addEventListener('resize', resize);
  resize();

  const place = () => {
    const d = 1500;
    camera.position.set(
      target.x + Math.cos(yawAnim) * Math.cos(PITCH) * d,
      target.y + Math.sin(PITCH) * d,
      target.z + Math.sin(yawAnim) * Math.cos(PITCH) * d,
    );
    camera.lookAt(target);
  };

  return {
    renderer, scene, camera,
    setTarget(x, z, y = 0) { target.set(x, y, z); },
    rotate(dir) { k = (k + dir + 4) % 4; },
    zoom(delta) { width = Math.min(MAX_W, Math.max(MIN_W, width * (delta > 0 ? 1.1 : 1 / 1.1))); resize(); },
    yaw() { return yawAnim; },
    viewWidth() { return width; },
    setQuality(q) { quality = q; applyShadows(); },
    setWidth(w) { width = Math.min(MAX_W, Math.max(MIN_W, w)); resize(); },
    render() {
      const goal = Math.PI / 4 + (k * Math.PI) / 2;
      let diff = goal - yawAnim;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // caminho mais curto
      yawAnim += diff * 0.2;
      place();
      sun.position.copy(target).addScaledVector(SUN_DIR, 800);
      sun.target.position.copy(target);
      const fog = scene.fog as THREE.Fog;
      fog.near = 1500 + width * 0.15; fog.far = 1500 + width * 1.6; // névoa por profundidade, escala com o zoom
      waterUniforms.uTime.value = performance.now() / 1000;
      renderer.render(scene, camera);
    },
  };
}

function skyGradient(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 2; c.height = 256;
  const g = c.getContext('2d')!, grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#7fa9cf'); grd.addColorStop(0.6, '#b9d3e6'); grd.addColorStop(1, '#dfe8e6');
  g.fillStyle = grd; g.fillRect(0, 0, 2, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
