// The sun. It has eyes. It is smiling. It is always watching.
//
// A procedurally-shaded billboard anchored to the SKY relative to the camera
// (same direction as the directional light, so shadows agree with it) — it
// follows you up the whole tower and you can never get closer. The pupils
// stare straight at you and dart toward whatever direction you move; it
// blinks every 11 seconds exactly; the smile widens as you climb.
import * as THREE from 'three';
import { emit } from '../core/events.js';

const SUN_DIR = new THREE.Vector3(80, 120, 60).normalize(); // matches the light
const DISTANCE = 800;
const SIZE = 170;

const sunMaterial = () =>
  new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uLook: { value: new THREE.Vector2(0, 0) }, // pupil dart, follows your motion
      uSmile: { value: 0 }, // 0..1 — widens as you climb
      uScare: { value: 0 }, // 1 while it is VERY CLOSE and looking at you
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec2 uLook;
      uniform float uSmile;
      uniform float uScare;
      varying vec2 vUv;

      const vec3 BODY = vec3(1.0, 0.86, 0.55);
      const vec3 EDGE = vec3(1.0, 0.78, 0.42);
      const vec3 INK = vec3(0.16, 0.20, 0.27); // slate, matches the world text

      void main() {
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        float a = atan(p.y, p.x);

        // rays: 12 soft triangular spikes, breathing very slowly
        float spikes = abs(fract(a / 6.2831853 * 12.0) - 0.5) * 2.0;
        float rayLen = 0.72 + 0.05 * sin(uTime * 0.6 + a * 3.0);
        float rays = 1.0 - smoothstep(0.60, rayLen, r + spikes * 0.16);

        // body disc with a soft warm edge
        float disc = 1.0 - smoothstep(0.54, 0.56, r);
        vec3 col = mix(EDGE, BODY, 1.0 - smoothstep(0.15, 0.56, r));
        float alpha = max(disc, rays * 0.9);

        // blink: every 11 s exactly, which is its own kind of wrong
        float bp = fract(uTime / 11.0);
        float blink = smoothstep(0.965, 0.982, bp) * (1.0 - smoothstep(0.982, 1.0, bp));
        blink *= 1.0 - uScare; // it does not blink while it is close

        // eyes — whites, then pupils that stare at YOU and dart when you move
        for (int i = 0; i < 2; i++) {
          vec2 eyeC = vec2(i == 0 ? -0.20 : 0.20, 0.15);
          vec2 e = (p - eyeC) / (0.105 * (1.0 + 0.35 * uScare)); // eyes widen
          e.y *= 0.82; // slightly wide ellipse
          float inEye = 1.0 - smoothstep(0.92, 1.0, length(e));
          // the whole eye shuts during a blink
          float open = inEye * (1.0 - smoothstep(0.4, 0.9, blink));
          col = mix(col, vec3(0.99, 0.99, 0.97), open);
          // pupil: dead center on you, plus your movement, plus an idle wander
          vec2 wander = vec2(sin(uTime * 0.43 + 1.7), cos(uTime * 0.31)) * 0.06;
          vec2 pupilC = eyeC + uLook * 0.045 + wander * 0.02;
          float pupilR = 1.0 + 0.9 * uScare; // pupils dilate
          float pupil = 1.0 - smoothstep(0.044 * pupilR, 0.052 * pupilR, length(p - pupilC));
          col = mix(col, INK, pupil * open);
          // glint — fixed, so the stare never softens
          float glint = 1.0 - smoothstep(0.008, 0.014, length(p - pupilC - vec2(0.016, 0.018)));
          col = mix(col, vec3(1.0), glint * open);
        }

        // the smile: an arc that widens the higher you climb
        float grin = max(uSmile, uScare); // full grin when it visits
        vec2 sm = p - vec2(0.0, 0.03);
        float smR = 0.30 + 0.04 * grin;
        float arc = abs(length(sm) - smR);
        float ang = atan(sm.y, sm.x); // -PI..PI, smile lives around -PI/2
        float spread = 0.55 + 0.5 * grin;
        float angMask = 1.0 - smoothstep(spread - 0.18, spread, abs(ang + 1.5707963));
        float smile = (1.0 - smoothstep(0.016, 0.030, arc)) * angMask * step(sm.y, 0.0);
        col = mix(col, INK, smile);
        // upturned corner dots appear as it gets happier about your progress
        for (int i = 0; i < 2; i++) {
          vec2 cornerC = vec2((i == 0 ? -1.0 : 1.0) * sin(spread) * smR, 0.03 - cos(spread) * smR);
          float corner = 1.0 - smoothstep(0.012, 0.024, length(p - cornerC));
          col = mix(col, INK, corner * grin);
        }

        gl_FragColor = vec4(col, alpha);
        if (alpha < 0.01) discard;
      }
    `,
  });

const LOOK_COS = Math.cos(0.32); // ~18 degrees counts as looking at it
const AWAY_TIME = 1.2; // must look away this long before the next look counts
const VISIT_DISTANCE = 30;
const VISIT_SCALE = 0.2;
const VISIT_TIME = 1.35;

export function createSun(scene) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(SIZE, SIZE),
    sunMaterial()
  );
  mesh.renderOrder = -1; // background element
  scene.add(mesh);

  const u = mesh.material.uniforms;
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const viewDir = new THREE.Vector3();

  // it counts your glances. on one of them — the 5th to 8th — it visits.
  let lookCount = 0;
  let looking = false;
  let awayTimer = AWAY_TIME;
  let visitAt = 5 + Math.floor(Math.random() * 4);
  let visited = false;
  let visitTimer = 0;

  function reset() {
    lookCount = 0;
    looking = false;
    awayTimer = AWAY_TIME;
    visitAt = 5 + Math.floor(Math.random() * 4);
    visited = false;
    endVisit();
  }

  function startVisit() {
    visited = true;
    visitTimer = VISIT_TIME;
    mesh.material.depthTest = false; // nothing may stand between you
    mesh.renderOrder = 999;
    emit('scare');
  }

  function endVisit() {
    visitTimer = 0;
    mesh.material.depthTest = true;
    mesh.renderOrder = -1;
    mesh.scale.setScalar(1);
  }

  function update(dt, camera, playerVel, playerHeight, locked) {
    u.uTime.value += dt;
    viewDir.set(0, 0, -1).applyQuaternion(camera.quaternion);

    if (visitTimer > 0) {
      // THE VISIT: right in front of you, and it follows your view —
      // you cannot look away
      visitTimer -= dt;
      mesh.position.copy(camera.position).addScaledVector(viewDir, VISIT_DISTANCE);
      mesh.scale.setScalar(VISIT_SCALE);
      mesh.lookAt(camera.position);
      u.uScare.value += (1 - u.uScare.value) * (1 - Math.exp(-18 * dt));
      u.uLook.value.set(0, 0); // pupils dead center: straight at you
      if (visitTimer <= 0) endVisit();
      return;
    }
    u.uScare.value = 0;

    // count discrete looks (only while playing)
    const lookingNow = locked && viewDir.dot(SUN_DIR) > LOOK_COS;
    if (lookingNow && !looking && awayTimer >= AWAY_TIME) {
      lookCount++;
      if (!visited && lookCount >= visitAt) startVisit();
    }
    if (!lookingNow) awayTimer += dt;
    else awayTimer = 0;
    looking = lookingNow;

    // anchored to the sky: same bearing from wherever you stand
    mesh.position.copy(camera.position).addScaledVector(SUN_DIR, DISTANCE);
    mesh.lookAt(camera.position);

    // pupils dart toward your movement, then settle back on YOU
    right.set(1, 0, 0).applyQuaternion(mesh.quaternion);
    up.set(0, 1, 0).applyQuaternion(mesh.quaternion);
    const tx = THREE.MathUtils.clamp(
      (playerVel.x * right.x + playerVel.y * right.y + playerVel.z * right.z) / 35, -1, 1);
    const ty = THREE.MathUtils.clamp(
      (playerVel.x * up.x + playerVel.y * up.y + playerVel.z * up.z) / 88, -1, 1);
    u.uLook.value.x += (-tx - u.uLook.value.x) * (1 - Math.exp(-3.5 * dt));
    u.uLook.value.y += (-ty - u.uLook.value.y) * (1 - Math.exp(-3.5 * dt));

    // it is pleased with your ascent
    u.uSmile.value = THREE.MathUtils.clamp(playerHeight / 685, 0, 1);
  }

  return { update, reset, stares: () => lookCount, isVisiting: () => visitTimer > 0 };
}
