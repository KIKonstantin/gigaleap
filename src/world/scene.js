// Scene, fog, and lighting. The directional light's shadow camera is a small
// ortho box that follows the player — a static frustum covering the whole
// tower would be unusably low-res.
import * as THREE from 'three';

// matches the hand-drawn sky's average tone, so fog fades the distance
// into the painting believably
const SKY = 0xdcebe0;

// daylight presets for the eclipse (world/eclipse.js): f=1 day, f=0 darkness
const DAY = { hemi: 0.85, dir: 1.9 };
const DUSK = { hemi: 0.12, dir: 0.15 };
const DUSK_SKY = 0x1a2333;

export function createScene({ shadows = true, shadowMapSize = 2048, shadowRadius = 4 } = {}) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 100, 700); // ~100 m gaps need long sightlines

  const hemi = new THREE.HemisphereLight(0xe8f1ff, 0xb8c4d0, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff4e0, 1.9);
  sun.castShadow = shadows;
  sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 400;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = shadowRadius; // soft edges with plain PCF
  scene.add(sun);
  scene.add(sun.target);

  // the sea (world/sea.js) covers the void below — no floor plane needed

  function followPlayer(pos) {
    sun.position.set(pos.x + 80, pos.y + 120, pos.z + 60);
    sun.target.position.set(pos.x, pos.y, pos.z);
  }

  // eclipse dimmer: lerp lights + sky/fog color between day (1) and dark (0).
  // The sea's injected shader reads the fog color uniform, so it follows.
  const daySky = new THREE.Color(SKY);
  const duskSky = new THREE.Color(DUSK_SKY);
  function setDaylight(f) {
    hemi.intensity = DUSK.hemi + (DAY.hemi - DUSK.hemi) * f;
    sun.intensity = DUSK.dir + (DAY.dir - DUSK.dir) * f;
    scene.background.copy(duskSky).lerp(daySky, f);
    scene.fog.color.copy(scene.background);
  }

  // governor hook: dropping the shadow pass at runtime is a lights-hash
  // change, so three recompiles programs once — acceptable on a downgrade
  function setShadows(enabled) {
    sun.castShadow = enabled;
    if (!enabled && sun.shadow.map) {
      sun.shadow.map.dispose(); // reclaim the depth target's VRAM
      sun.shadow.map = null;
    }
  }

  return { scene, followPlayer, setDaylight, setShadows };
}
