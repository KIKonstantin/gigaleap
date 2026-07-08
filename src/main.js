import * as THREE from 'three';
import { startLoop } from './core/loop.js';
import { input, initInput } from './core/input.js';
import { on } from './core/events.js';
import { createAudio } from './core/audio.js';
import { createScene } from './world/scene.js';
import { createSun } from './world/sun.js';
import { createSunRays } from './world/sunRays.js';
import { createSkyDome } from './world/skyDome.js';
import { createClouds } from './world/clouds.js';
import { createSea } from './world/sea.js';
import { createWindStreaks } from './world/windStreaks.js';
import { createRain } from './world/rain.js';
import { createEclipse } from './world/eclipse.js';
import { initClouds } from './level/clouds.js';
import { initWind } from './level/wind.js';
import { CLOUDS, WIND_ZONES } from './level/levelData.js';
import { buildLevel, syncMoverMeshes } from './level/level.js';
import { stepMovers } from './level/movers.js';
import { stepCrumble, restoreCrumble, syncCrumbleMeshes } from './level/crumble.js';
import { stepUnstable, restoreUnstable, syncUnstableMeshes } from './level/unstable.js';
import { createBouncePads } from './level/bouncePads.js';
import { createController, TUNING } from './player/controller.js';
import { createPostFX } from './fx/postfx.js';
import { createShockwaves } from './fx/shockwave.js';
import { createPlatformPulse } from './fx/platformPulse.js';
import { createLevelText } from './fx/levelText.js';
import { createHUD } from './ui/hud.js';
import { createDebugPanel } from './ui/debugPanel.js';

const renderer = new THREE.WebGLRenderer({ antialias: false }); // MSAA lives in the composer target
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // softness via shadow.radius (PCFSoft removed in r185)
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.body.appendChild(renderer.domElement);

const { scene, followPlayer, setDaylight } = createScene();
const camera = new THREE.PerspectiveCamera(
  75, window.innerWidth / window.innerHeight, 0.1, 4000
);
camera.rotation.order = 'YXZ';

const sun = createSun(scene);
const skyDome = createSkyDome(scene);
const { colliders: platforms, movers, crumblers, unstables } = buildLevel(scene);
const clouds = initClouds(CLOUDS);
const cloudScape = createClouds(scene);
const winds = initWind(WIND_ZONES);
const windStreaks = createWindStreaks(scene);
const rain = createRain(scene);
const player = createController(platforms, clouds, winds);

// spawn facing the first platform
const first = platforms[1];
input.yaw = Math.atan2(
  -(first.min.x + first.max.x) / 2,
  -(first.min.z + first.max.z) / 2
);
const postfx = createPostFX(renderer, scene, camera);
const shockwaves = createShockwaves(scene);
const platformPulse = createPlatformPulse();
const bouncePads = createBouncePads(platforms);
const levelText = createLevelText(scene);
const hud = createHUD();

// big in-the-air "LEVEL {N}" letters when a new checkpoint band is reached;
// the start pad counts as checkpoint 0, so the first landing shows LEVEL 1
const checkpoints = platforms.filter((p) => p.def.checkpoint);
let levelShown = 0;

const eclipse = createEclipse({
  setDaylight: (F) => { setDaylight(F); skyDome.setDaylight(F); },
  sun,
  getLevel: () => levelShown,
});
const sunRays = createSunRays(scene, {
  sun, player,
  getLevel: () => levelShown,
  isEclipsed: () => eclipse.isDark(),
});
const sea = createSea(scene, { getLevel: () => levelShown });

// one-shot flavor texts; each fires once per run
const LEVEL_QUIPS = {
  2: 'IT WATCHES',
  4: 'DID YOU BRING\nSUNCREAM?',
  6: 'STILL CLIMBING?',
  8: 'NO MORE\nMR NICE SUN',
  9: 'ONE MORE DASH',
};
const saidQuips = new Set();

function quipAtPlayer(key, text, opts = {}) {
  if (saidQuips.has(key)) return;
  saidQuips.add(key);
  levelText.show(text, {
    x: player.pos.x - Math.sin(input.yaw) * 26,
    y: player.pos.y + 5,
    z: player.pos.z - Math.cos(input.yaw) * 26,
  }, { cell: 0.55, color: 0xc47b3d, hold: 3.4, ...opts });
}

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
  const quipText = LEVEL_QUIPS[level];
  if (quipText && !saidQuips.has(`level${level}`)) {
    saidQuips.add(`level${level}`);
    levelText.show(quipText, {
      x: cx + (nx / len) * 30,
      y: platform.max.y + 7,
      z: cz + (nz / len) * 30,
    }, { cell: 0.55, color: 0xc47b3d, hold: 3.8 });
  }
}

on('land', ({ platform }) => {
  const k = checkpoints.indexOf(platform);
  if (k >= 0 && k + 1 > levelShown) showLevelAt(platform, k + 1);
});

// tutorial hints: landing right before a special section floats its verb
// over the gap ahead — "SPRINT" before a crumbling bridge, "DASH" before a
// dash-only gap. Color-coded to the platforms they teach.
const hints = new Map();
let unstableHinted = false;
let cloudHinted = false;
let bounceHinted = false;
let windHinted = false;
const windTargets = new Set(WIND_ZONES.map((z) => z.idx));
for (let i = 1; i < platforms.length; i++) {
  const cur = platforms[i], prev = platforms[i - 1];
  if (cur.def.crumble && !prev.def.crumble) {
    hints.set(prev, { text: 'SPRINT', color: 0xd9756b, target: cur });
  } else if (cur.def.dash) {
    hints.set(prev, { text: 'DASH', color: 0x7a68e8, target: cur });
  } else if (cur.def.bounce && !bounceHinted && !hints.has(prev)) {
    hints.set(prev, { text: 'BOUNCE', color: 0x74a857, target: cur });
    bounceHinted = true;
  } else if (cur.def.cloud && !cloudHinted && !hints.has(prev)) {
    hints.set(prev, { text: 'DASH THROUGH', color: 0x8fa8b8, target: cur });
    cloudHinted = true;
  } else if (cur.def.unstable && !unstableHinted && !hints.has(prev)) {
    // only the first one gets a warning — after that the wobble teaches you
    hints.set(prev, { text: 'NO CAMPING', color: 0xc96f5a, target: cur });
    unstableHinted = true;
  } else if (windTargets.has(i) && !windHinted && !hints.has(prev)) {
    hints.set(prev, { text: 'LEAN IN', color: 0xa3b8cc, target: cur });
    windHinted = true;
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

const audio = createAudio();

initInput(renderer.domElement, (locked) => {
  audio.setLocked(locked);
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
on('respawn', () => {
  restoreCrumble(crumblers);
  restoreUnstable(unstables);
});
on('rayhit', () => quipAtPlayer('spf', 'SPF 5000'));
on('cloudenter', () => quipAtPlayer('cloud', "CAN'T SEE?\nCAN'T STEER?"));

function restartRun() {
  player.reset();
  restoreCrumble(crumblers);
  restoreUnstable(unstables);
  sun.reset();
  sunRays.reset();
  eclipse.reset();
  levelShown = 0;
  hintsShown.clear();
  saidQuips.clear();
  runTime = 0;
  hud.hideWin();
  if (!input.locked) hud.showStart();
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyR') restartRun();
  if (e.code === 'KeyM') audio.toggleMute();
});

function update(dt) {
  if (!input.locked || player.won) return; // paused
  levelTime += dt;
  stepMovers(movers, levelTime);
  player.step(dt, input);
  stepCrumble(crumblers, dt, player.groundPlatform);
  stepUnstable(unstables, dt, player.groundPlatform);
  // splashing into the sea is a respawn — the maw handles high falls (it
  // swallows you just above the waterline), the water itself handles low ones
  if (!player.grounded && !player.flying && !player.invincible && eatenTimer <= 0
    && player.feetY() < sea.seaLevel() + 1) {
    player.devour();
    quipAtPlayer('swim', 'NO SWIMMING');
  }
  if (eatenTimer > 0) {
    eatenTimer -= dt;
    if (eatenTimer <= 0) {
      player.devour();
      quipAtPlayer('nom', 'OM NOM NOM');
    }
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
  eclipse.update(delta, input.locked && !player.won);
  sunRays.update(delta, input.locked);
  if (sun.stares() >= 2) {
    quipAtPlayer('eyes', 'EYES HURT WHEN YOU\nLOOK AT THE SUN');
  }
  syncMoverMeshes(movers, alpha);
  syncCrumbleMeshes(crumblers, levelTime);
  cloudScape.update(levelTime);
  windStreaks.update(delta);
  sea.update(levelTime, delta, player.pos, player.activeCheckpoint.max.y);
  rain.update(delta, camera.position, sea.storm());
  shockwaves.update(delta);
  platformPulse.update(delta);
  bouncePads.update(delta);
  syncUnstableMeshes(unstables, levelTime); // after the pulse so the wobble glow wins
  levelText.update(delta, camera.position);
  hud.update(player.feetY(), levelShown, runTime);

  audio.update(delta, {
    speed: Math.hypot(player.vel.x, player.vel.y, player.vel.z),
    velY: player.vel.y,
    inCloud: player.inCloud,
    seaProx: player.feetY() - sea.seaLevel(),
    storm: sea.storm(),
  });

  const sprinting = input.sprint && Math.hypot(player.vel.x, player.vel.z) > 8;
  // wind rush ramps with fall speed (starts at 25 m/s, maxes at terminal 130)
  const rush = Math.max(0, Math.min(1, (-player.vel.y - 25) / 105));
  postfx.render(delta, sprinting ? 9 : 0, rush, player.vel.y);
  debugPanel.update();
}

const debugPanel = createDebugPanel({
  player, sun, sunRays, eclipse, checkpoints, platforms, crumblers, unstables, hud, audio,
  getLevel: () => levelShown,
  setLevel: (n) => { levelShown = n; },
  restartRun,
});

window.__ascent = { player, input, on, movers, platforms, crumblers, unstables, clouds, winds, sun, sunRays, sea, audio, eclipse, rain, TUNING }; // debug/testing handle

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  postfx.setSize(window.innerWidth, window.innerHeight);
});

startLoop({ update, render });
