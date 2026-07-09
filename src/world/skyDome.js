// Hand-drawn sky: the painting at /public/sky.png mapped inside a huge
// sphere that follows the camera. A single (non-panoramic) painting can't
// wrap a cube or sphere without seams — MIRRORED tiling makes the wrap
// seamless and gives the clouds a dreamy kaleidoscope drift instead.
// If the file is missing, the flat background color quietly remains.
import * as THREE from 'three';

const RADIUS = 3200; // inside the camera far plane (4000)

export function createSkyDome(scene, { url = '/sky.png', segments = 48 } = {}) {
  let mesh = null;

  new THREE.TextureLoader().load(
    url,
    (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.MirroredRepeatWrapping;
      tex.wrapT = THREE.MirroredRepeatWrapping;
      tex.repeat.set(3, 2);
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(RADIUS, segments, segments / 2),
        new THREE.MeshBasicMaterial({
          map: tex,
          side: THREE.BackSide,
          fog: false,
          depthWrite: false,
        })
      );
      mesh.renderOrder = -2; // behind everything, including the sun
      scene.add(mesh);
    },
    undefined,
    () => {} // no painting, no problem — flat color fallback
  );

  return {
    follow(pos) {
      if (mesh) mesh.position.copy(pos);
    },
    // the painted sky is unlit — the eclipse must tint it down explicitly
    setDaylight(f) {
      if (mesh) mesh.material.color.setScalar(0.12 + 0.88 * f);
    },
  };
}
