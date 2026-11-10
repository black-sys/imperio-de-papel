import * as THREE from 'three';

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
}

export function createScene(canvas: HTMLCanvasElement): IsoScene {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x9ec4e0);
  scene.add(new THREE.HemisphereLight(0xdfefff, 0x4a3f30, 1.1));
  const sun = new THREE.DirectionalLight(0xfff2dd, 2.0);
  sun.position.set(-0.5, 1, -0.3);
  scene.add(sun);

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
    setWidth(w) { width = Math.min(MAX_W, Math.max(MIN_W, w)); resize(); },
    render() {
      const goal = Math.PI / 4 + (k * Math.PI) / 2;
      let diff = goal - yawAnim;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff)); // caminho mais curto
      yawAnim += diff * 0.2;
      place();
      renderer.render(scene, camera);
    },
  };
}
