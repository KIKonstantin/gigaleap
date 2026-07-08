// The sun. It has eyes. It is smiling. It is always watching.
//
// A procedurally-shaded billboard anchored to the SKY relative to the camera
// (same direction as the directional light, so shadows agree with it) — it
// follows you up the whole tower and you can never get closer. The pupils
// stare straight at you and dart toward whatever direction you move; it
// blinks every 11 seconds exactly; the smile widens as you climb.
import * as THREE from 'three';
import { emit } from '../core/events.js';
import { SUN_ANCHOR, GOAL_TOP } from '../level/levelData.js';

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
      uMouth: { value: 0 }, // 0..1 jaw drop — it is about to eat you
      uDim: { value: 0 }, // 1 = eclipsed: the sun goes out
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
      uniform float uMouth;
      uniform float uDim;
      varying vec2 vUv;

      const vec3 BODY = vec3(1.0, 0.76, 0.28); // rich gold — pops off the pale sky
      const vec3 EDGE = vec3(1.0, 0.62, 0.16);
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
        float alpha = max(disc, rays);

        // warm halo beyond the rays — separates it from any sky behind
        float halo = (1.0 - smoothstep(0.58, 1.0, r)) * 0.3;
        if (alpha < halo) {
          col = vec3(1.0, 0.9, 0.62);
          alpha = halo;
        }

        // thin ink outline on the disc: drawn-on-top sticker energy
        float outline = 1.0 - smoothstep(0.008, 0.018, abs(r - 0.555));
        col = mix(col, INK, outline * 0.85);

        // blink: every 11 s exactly, which is its own kind of wrong
        float bp = fract(uTime / 11.0);
        float blink = smoothstep(0.965, 0.982, bp) * (1.0 - smoothstep(0.982, 1.0, bp));
        blink *= 1.0 - uScare; // it does not blink while it is close

        // eyes — whites, then pupils that stare at YOU and dart when you move
        for (int i = 0; i < 2; i++) {
          vec2 eyeC = vec2(i == 0 ? -0.20 : 0.20, 0.15);
          float wide = max(uScare, uMouth);
          vec2 e = (p - eyeC) / (0.105 * (1.0 + 0.35 * wide)); // eyes widen
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

        // the smile: an arc that widens the higher you climb.
        // no smile down in the pit — it vanishes the moment the jaw starts.
        float smileVis = 1.0 - smoothstep(0.0, 0.2, uMouth);
        float grin = max(uSmile, uScare) * smileVis;
        vec2 sm = p - vec2(0.0, 0.03);
        float smR = 0.30 + 0.04 * grin;
        float arc = abs(length(sm) - smR);
        float ang = atan(sm.y, sm.x); // -PI..PI, smile lives around -PI/2
        float spread = 0.55 + 0.5 * grin;
        float angMask = 1.0 - smoothstep(spread - 0.18, spread, abs(ang + 1.5707963));
        float smile = (1.0 - smoothstep(0.016, 0.030, arc)) * angMask * step(sm.y, 0.0);
        col = mix(col, INK, smile * smileVis);
        // upturned corner dots appear as it gets happier about your progress
        for (int i = 0; i < 2; i++) {
          vec2 cornerC = vec2((i == 0 ? -1.0 : 1.0) * sin(spread) * smR, 0.03 - cos(spread) * smR);
          float corner = 1.0 - smoothstep(0.012, 0.024, length(p - cornerC));
          col = mix(col, INK, corner * grin);
        }

        // the mouth: a jaw that drops open into a VOID
        if (uMouth > 0.01) {
          vec2 m = (p - vec2(0.0, -0.13)) / vec2(0.30 + 0.15 * uMouth, max(0.47 * uMouth, 0.001));
          float mouthMask = 1.0 - smoothstep(0.88, 1.0, length(m));
          // pure black void with a thin dark-red lip at the rim
          vec3 maw = mix(vec3(0.01, 0.01, 0.02), vec3(0.30, 0.12, 0.12),
            smoothstep(0.82, 0.98, length(m)));
          col = mix(col, maw, mouthMask * uMouth);
        }

        col *= mix(1.0, 0.22, uDim); // eclipsed: the light goes out
        gl_FragColor = vec4(col, alpha);
        if (alpha < 0.01) discard;
      }
    `,
  });

const LOOK_COS = Math.cos(0.32); // ~18 degrees counts as looking at it
const AWAY_TIME = 1.2; // must look away this long before the next look counts
const VISIT_DISTANCE = 30;
const VISIT_SCALE = 0.5;
const VISIT_TIME = 1.35;
const WORLD_SCALE = 0.38; // sun size once it anchors over its platform ring
const rollVisit = () => 3 + Math.floor(Math.random() * 6); // every 3-8 looks
const EAT_DROP = 80; // this far below your checkpoint, falling fast: doomed
const EAT_DEPTH = 450; // it waits FAR below — a long stare into the maw
const EAT_SCALE = 5.6; // enormous when it feeds
const SWALLOW_DISTANCE = 60;

export function createSun(scene) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(SIZE, SIZE),
    sunMaterial()
  );
  mesh.renderOrder = -1; // background element
  mesh.frustumCulled = false; // always considered visible — it IS
  scene.add(mesh);

  const u = mesh.material.uniforms;
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  const viewDir = new THREE.Vector3();
  const dirToSun = new THREE.Vector3();
  const anchor = new THREE.Vector3(SUN_ANCHOR[0], SUN_ANCHOR[1], SUN_ANCHOR[2]);

  // it counts your glances. every 3rd to 8th of them, it visits.
  let lookCount = 0;
  let looking = false;
  let awayTimer = AWAY_TIME;
  let visitAt = rollVisit();
  let visitTimer = 0;
  let eating = false;
  let swallowed = false;
  let eatY = 0;
  let angry = 0; // sunRays charging: the scare-face becomes a target-lock face
  let dim = 0; // eclipse darkness (world/eclipse.js drives it)
  let eatEnabled = true; // debug: the sun can be told to fast

  function reset() {
    lookCount = 0;
    looking = false;
    awayTimer = AWAY_TIME;
    visitAt = lookCount + rollVisit();
    endVisit();
    endEat();
  }

  function startEat(camera) {
    endVisit();
    eating = true;
    swallowed = false;
    eatY = camera.position.y - EAT_DEPTH;
    // LIGHTNING: it is simply THERE, below you, at full size
    mesh.position.set(camera.position.x, eatY, camera.position.z);
    mesh.scale.setScalar(EAT_SCALE);
    mesh.material.depthTest = false; // nothing hides the maw
    mesh.renderOrder = 999;
  }

  function endEat() {
    eating = false;
    swallowed = false;
    mesh.material.depthTest = true;
    mesh.renderOrder = -1;
  }

  function startVisit() {
    visitAt = lookCount + rollVisit(); // and it will visit again
    visitTimer = VISIT_TIME;
    mesh.material.depthTest = false; // nothing may stand between you
    mesh.renderOrder = 999;
    emit('scare');
  }

  function endVisit() {
    visitTimer = 0;
    mesh.material.depthTest = true;
    mesh.renderOrder = -1;
  }

  function update(dt, camera, player, locked) {
    const playerVel = player.vel;
    const playerHeight = player.feetY();
    u.uTime.value += dt;
    u.uDim.value = dim;
    viewDir.set(0, 0, -1).applyQuaternion(camera.quaternion);

    // THE FEEDING: a doomed fall summons it below you
    const drop = player.activeCheckpoint.max.y - player.pos.y;
    if (!eating && eatEnabled && !player.invincible && locked &&
        !player.grounded && drop > EAT_DROP && playerVel.y < -30) {
      startEat(camera);
    }
    if (eating) {
      if (player.grounded && !swallowed) { endEat(); } // you escaped. this time.
      else {
        // locked under your fall path, mouth opening as you close in
        dirToSun.set(camera.position.x, eatY, camera.position.z); // reuse as target
        mesh.position.lerp(dirToSun, 1 - Math.exp(-12 * dt)); // tracks your drift
        mesh.lookAt(camera.position);
        u.uMouth.value += (1 - u.uMouth.value) * (1 - Math.exp(-4 * dt));
        u.uScare.value = 0;
        u.uSmile.value = 0; // nothing to smile about. dinner time.
        u.uLook.value.set(0, 0); // it watches you all the way down
        if (!swallowed && camera.position.y - mesh.position.y < SWALLOW_DISTANCE) {
          swallowed = true;
          emit('eaten');
        }
        if (swallowed && player.grounded) endEat(); // respawned: done feeding
        return;
      }
    }
    u.uMouth.value *= Math.exp(-6 * dt); // jaw eases shut

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
    // charging a ray: ease into the wide-eyed hunting face
    u.uScare.value += (angry - u.uScare.value) * (1 - Math.exp(-10 * dt));

    // near the summit the sun stops being sky and becomes a PLACE: it
    // anchors over the final platform ring so you orbit it to the goal
    const blend = THREE.MathUtils.smoothstep(
      playerHeight, SUN_ANCHOR[1] - 300, SUN_ANCHOR[1] - 120);
    mesh.position.copy(camera.position).addScaledVector(SUN_DIR, DISTANCE);
    mesh.position.lerp(anchor, blend);
    mesh.scale.setScalar(THREE.MathUtils.lerp(1, WORLD_SCALE, blend) * (1 - 0.15 * dim));
    mesh.lookAt(camera.position);

    // count discrete looks toward wherever it currently is (only while playing)
    dirToSun.copy(mesh.position).sub(camera.position).normalize();
    const lookingNow = locked && viewDir.dot(dirToSun) > LOOK_COS;
    if (lookingNow && !looking && awayTimer >= AWAY_TIME) {
      lookCount++;
      if (lookCount >= visitAt) startVisit();
    }
    if (!lookingNow) awayTimer += dt;
    else awayTimer = 0;
    looking = lookingNow;

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
    u.uSmile.value = THREE.MathUtils.clamp(playerHeight / (GOAL_TOP * 1.15), 0, 1);
  }

  return {
    update,
    reset,
    stares: () => lookCount,
    isVisiting: () => visitTimer > 0,
    isEating: () => eating,
    position: mesh.position, // live ref — read-only by convention
    setAngry: (v) => { angry = v; },
    setDim: (v) => { dim = v; },
    setEatEnabled: (v) => { eatEnabled = v; },
    forceVisit: () => startVisit(), // debug
  };
}
