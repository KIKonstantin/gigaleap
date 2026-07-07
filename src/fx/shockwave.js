// World-space landing shockwave: a pooled set of flat ring planes with a
// custom ShaderMaterial that expands and fades over 0.6 s.
import * as THREE from 'three';
import { on } from '../core/events.js';

const POOL_SIZE = 4;
const LIFETIME = 0.6;

// dark slate ripple, normal blending — additive white would wash out
// against the pastel platforms
const RING_COLOR = 0x3d4a5c;

const ringMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uProgress: { value: 0 },
      uColor: { value: new THREE.Color(RING_COLOR) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uProgress;
      uniform vec3 uColor;
      varying vec2 vUv;
      void main() {
        float d = length(vUv - 0.5);
        float radius = mix(0.08, 0.46, uProgress);
        float ring = smoothstep(0.045, 0.0, abs(d - radius));
        float fade = (1.0 - uProgress) * (1.0 - uProgress);
        gl_FragColor = vec4(uColor, ring * fade * 0.55);
      }
    `,
  });

export function createShockwaves(scene) {
  const pool = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), ringMaterial());
    mesh.rotation.x = -Math.PI / 2;
    mesh.visible = false;
    scene.add(mesh);
    pool.push({ mesh, age: Infinity, intensity: 0 });
  }
  let next = 0;

  function spawn(position, intensity) {
    const wave = pool[next];
    next = (next + 1) % POOL_SIZE;
    wave.mesh.position.set(position.x, position.y + 0.02, position.z);
    wave.mesh.visible = true;
    wave.age = 0;
    wave.intensity = intensity;
  }

  on('land', ({ fx, intensity, position }) => {
    if (fx) spawn(position, intensity);
  });

  function update(dt) {
    for (const wave of pool) {
      if (!wave.mesh.visible) continue;
      wave.age += dt;
      const t = wave.age / LIFETIME;
      if (t >= 1) {
        wave.mesh.visible = false;
        continue;
      }
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      const scale = THREE.MathUtils.lerp(0.5, 1.8 + 1.6 * wave.intensity, eased);
      wave.mesh.scale.setScalar(scale);
      wave.mesh.material.uniforms.uProgress.value = t;
    }
  }

  return { update };
}
