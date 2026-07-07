import * as THREE from 'three';
import { startLoop } from './core/loop.js';
import { input, initInput } from './core/input.js';
import { on } from './core/events.js';
import { createScene } from './world/scene.js';
import { createSun } from './world/sun.js';
import { createSkyDome } from './world/skyDome.js';
import { buildLevel, syncMoverMeshes } from './level/level.js';
import { stepMovers } from './level/movers.js';
import { stepCrumble, restoreCrumble, syncCrumbleMeshes } from './level/crumble.js';
import { createController } from './player/controller.js';
import { createPostFX } from './fx/postfx.js';
import { createShockwaves } from './fx/shockwave.js';
import { createPlatformPulse } from './fx/platformPulse.js';
import { createLevelText } from './fx/levelText.js';
import { createHUD } from './ui/hud.js';

const renderer = new THREE.WebGLRenderer({ antialias: false }); // MSAA lives in the composer target
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // softness via shadow.radius (PCFSoft removed in r185)
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const { scene, followPlayer } = createScene();
const camera = new THREE.PerspectiveCamera(
  75, window.innerWidth / window.innerHeight, 0.1, 4000
);
camera.rotation.order = 'YXZ';

const sun = createSun(scene);
const skyDome = createSkyDome(scene);
const { colliders: platforms, movers, crumblers } = buildLevel(scene);
const player = createController(platforms);

// spawn facing the first platform
const first = platforms[1];
input.yaw = Math.atan2(
  -(first.min.x + first.max.x) / 2,
  -(first.min.z + first.max.z) / 2
);
const postfx = createPostFX(renderer, scene, camera);
const shockwaves = createShockwaves(scene);
const platformPulse = createPlatformPulse();
const levelText = createLevelText(scene);
const hud = createHUD();

// big in-the-air "LEVEL {N}" letters when a new checkpoint band is reached;
// the start pad counts as checkpoint 0, so the first landing shows LEVEL 1
const checkpoints = platforms.filter((p) => p.def.checkpoint);
let levelShown = 0;

function showLevelAt(platform, level) {
  levelShown = level;
  // float the letters along the path toward the next platform
  const next = platforms[platforms.indexOf(platform) + 1];
  const cx = (platform.min.x + platform.max.x) / 2;
  const cz = (platform.min.z + platform.max.z) / 2;
  const nx = (next.min.x + next.max.x) / 2 - cx;
  const nz = (next.min.z + next.max.z) / 2 - cz;
  const len = Math.hypot(nx, nz) || 1;
  levelText.show(`LEVEL ${level}`, {
    x: cx + (nx / len) * 30,
    y: platform.max.y + 14,
    z: cz + (nz / len) * 30,
  });
}

on('land', ({ platform }) => {
  const k = checkpoints.indexOf(platform);
  if (k >= 0 && k + 1 > levelShown) showLevelAt(platform, k + 1);
});

// tutorial hints: landing right before a special section floats its verb
// over the gap ahead — "SPRINT" before a crumbling bridge, "DASH" before a
// dash-only gap. Color-coded to the platforms they teach.
const hints = new Map();
for (let i = 1; i < platforms.length; i++) {
  const cur = platforms[i], prev = platforms[i - 1];
  if (cur.def.crumble && !prev.def.crumble) {
    hints.set(prev, { text: 'SPRINT', color: 0xd9756b, target: cur });
  } else if (cur.def.dash) {
    hints.set(prev, { text: 'DASH', color: 0x7a68e8, target: cur });
  }
}
const hintsShown = new Set();
on('land', ({ platform }) => {
  const hint = hints.get(platform);
  if (!hint || hintsShown.has(platform)) return;
  hintsShown.add(platform);
  const cx = (platform.min.x + platform.max.x) / 2;
  const cz = (platform.min.z + platform.max.z) / 2;
  const tx = (hint.target.min.x + hint.target.max.x) / 2 - cx;
  const tz = (hint.target.min.z + hint.target.max.z) / 2 - cz;
  const len = Math.hypot(tx, tz) || 1;
  levelText.show(hint.text, {
    x: cx + (tx / len) * 24,
    y: platform.max.y + 9,
    z: cz + (tz / len) * 24,
  }, { cell: 0.65, color: hint.color, hold: 3.2 });
});

initInput(renderer.domElement, (locked) => {
  if (locked) {
    hud.hideStart();
    // the spawn starts already grounded (no landing event), so LEVEL 1
    // pops on first entry instead
    if (levelShown === 0) showLevelAt(checkpoints[0], 1);
  } else if (!hud.isWinShown()) {
    hud.showStart();
  }
});

let runTime = 0;
let levelTime = 0;
let eatenTimer = 0; // brief darkness between the maw and the respawn

on('eaten', () => { eatenTimer = 0.35; });

on('win', ({ height }) => {
  hud.showWin(height, runTime);
  document.exitPointerLock();
});
on('respawn', () => restoreCrumble(crumblers));

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR') {
    player.reset();
    restoreCrumble(crumblers);
    sun.reset();
    levelShown = 0;
    hintsShown.clear();
    runTime = 0;
    hud.hideWin();
    if (!input.locked) hud.showStart();
  }
});

function update(dt) {
  if (!input.locked || player.won) return; // paused
  levelTime += dt;
  stepMovers(movers, levelTime);
  player.step(dt, input);
  stepCrumble(crumblers, dt, player.groundPlatform);
  if (eatenTimer > 0) {
    eatenTimer -= dt;
    if (eatenTimer <= 0) player.devour();
  }
  runTime += dt;
}

function render(delta, alpha) {
  // interpolate 60 Hz physics to display rate
  const p = player.pos, q = player.prevPos;
  camera.position.set(
    q.x + (p.x - q.x) * alpha,
    q.y + (p.y - q.y) * alpha + player.eyeAboveCenter,
    q.z + (p.z - q.z) * alpha
  );
  camera.rotation.y = input.yaw;
  camera.rotation.x = input.pitch;

  followPlayer(p);
  skyDome.follow(camera.position);
  sun.update(delta, camera, player, input.locked);
  hud.setStares(sun.stares());
  syncMoverMeshes(movers, alpha);
  syncCrumbleMeshes(crumblers, levelTime);
  shockwaves.update(delta);
  platformPulse.update(delta);
  levelText.update(delta, camera.position);
  hud.update(player.feetY());

  const sprinting = input.sprint && Math.hypot(player.vel.x, player.vel.z) > 8;
  // wind rush ramps with fall speed (starts at 25 m/s, maxes at terminal 130)
  const rush = Math.max(0, Math.min(1, (-player.vel.y - 25) / 105));
  postfx.render(delta, sprinting ? 9 : 0, rush, player.vel.y);
}

window.__ascent = { player, input, on, movers, platforms, crumblers, sun }; // debug/testing handle

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  postfx.setSize(window.innerWidth, window.innerHeight);
});

startLoop({ update, render });
