// Scene, fog, and lighting. The directional light's shadow camera is a small
// ortho box that follows the player — a static frustum covering the whole
// tower would be unusably low-res.
import * as THREE from 'three';

const SKY = 0xdfe8f0;

export function createScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY);
  scene.fog = new THREE.Fog(SKY, 100, 700); // ~100 m gaps need long sightlines

  scene.add(new THREE.HemisphereLight(0xe8f1ff, 0xb8c4d0, 0.85));

  const sun = new THREE.DirectionalLight(0xfff4e0, 1.9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -60;
  sun.shadow.camera.right = 60;
  sun.shadow.camera.top = 60;
  sun.shadow.camera.bottom = -60;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 400;
  sun.shadow.bias = -0.0005;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 4; // soft edges with plain PCF
  scene.add(sun);
  scene.add(sun.target);

  // fog-colored plane far below so looking straight down never shows raw void
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(10000, 10000),
    new THREE.MeshBasicMaterial({ color: SKY })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -400;
  scene.add(floor);

  function followPlayer(pos) {
    sun.position.set(pos.x + 80, pos.y + 120, pos.z + 60);
    sun.target.position.set(pos.x, pos.y, pos.z);
  }

  return { scene, followPlayer };
}
