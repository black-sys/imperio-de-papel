import * as THREE from 'three';

/** Uniforms compartilhados por toda a água L0. */
export const waterUniforms = { uTime: { value: 0 }, uAnim: { value: 1 } };

/**
 * Água low-poly animada: ondulação de vértices (as facetas cintilam via flatShading), espuma pulsando em quads
 * de margem (atributo `foam`) e ondas correndo na direção da correnteza dos rios (atributo `flow`).
 */
export function makeWaterMaterial(): THREE.MeshLambertMaterial {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, transparent: true, opacity: 0.8, depthWrite: false });
  m.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, waterUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform float uAnim;
        attribute float foam; attribute vec2 flow;
        varying float vFoam; varying float vPhase;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec2 p = position.xz;
        float along = dot(p, flow) * 1.3 - uTime * 2.2;          // correnteza (0 fora de rio)
        float wave = sin(p.x * 0.9 + uTime * 1.1) * 0.5 + cos(p.y * 0.8 + uTime * 1.4) * 0.5;
        float w = length(flow) > 0.0 ? sin(along) : wave;
        transformed.y += w * 0.07 * uAnim;
        vFoam = foam; vPhase = p.x * 0.3 + p.y * 0.2;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform float uTime; uniform float uAnim;
        varying float vFoam; varying float vPhase;`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float pulse = 0.45 + 0.25 * sin(uTime * 2.0 + vPhase) * uAnim;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.96, 1.0), vFoam * pulse);
        diffuseColor.a = mix(diffuseColor.a, 0.95, vFoam * pulse);`);
  };
  return m;
}
