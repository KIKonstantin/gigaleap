// Debug panel (lil-gui). Backquote (`) toggles — opening frees the pointer
// (game pauses via the existing lock logic); edit values, click back in.
// KeyV toggles fly without opening the panel.
import GUI from 'lil-gui';
import { TUNING, TUNING_DEFAULTS } from '../player/controller.js';
import { restoreCrumble } from '../level/crumble.js';
import { restoreUnstable } from '../level/unstable.js';

export function createDebugPanel({
  player, sun, sunRays, eclipse, checkpoints, platforms, crumblers, unstables, hud, audio,
  getLevel, setLevel, restartRun,
}) {
  const gui = new GUI({ title: 'GIGALEAP DEBUG' });
  gui.hide();
  let shown = false;

  // typing in panel fields must never reach the game key handlers, and
  // clicking the panel must not re-lock the pointer (input.js listens on
  // document clicks)
  gui.domElement.addEventListener('keydown', (e) => e.stopPropagation());
  gui.domElement.addEventListener('click', (e) => e.stopPropagation());

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Backquote') {
      shown = !shown;
      gui.show(shown);
      if (shown) document.exitPointerLock();
    }
    if (e.code === 'KeyV') player.flying = !player.flying;
  });

  // --- Level ---------------------------------------------------------------
  const goalPlatform = platforms.find((p) => p.def.goal);
  const levelChoices = {};
  checkpoints.forEach((_, k) => { levelChoices[`LEVEL ${k + 1}`] = k; });
  levelChoices['GOAL'] = 'goal';

  const state = {
    startAt: 0,
    level: 0,
    height: '0.0 m',
    rayCooldown: 0,
  };

  const fLevel = gui.addFolder('Level');
  fLevel.add(state, 'startAt', levelChoices).name('start at').onChange((v) => {
    const p = v === 'goal' ? goalPlatform : checkpoints[v];
    player.won = false;
    player.activeCheckpoint = v === 'goal' ? checkpoints[checkpoints.length - 1] : p;
    player.placeAt(p);
    restoreCrumble(crumblers);
    restoreUnstable(unstables);
    setLevel(v === 'goal' ? checkpoints.length : v + 1);
    hud.hideWin();
  });
  fLevel.add(state, 'level').name('current level').listen().disable();
  fLevel.add(state, 'height').name('height').listen().disable();
  fLevel.add({ restart: restartRun }, 'restart').name('restart run');

  // --- Player --------------------------------------------------------------
  const fPlayer = gui.addFolder('Player');
  fPlayer.add(player, 'flying').name('fly (V)').listen();
  fPlayer.add(player, 'flySpeed', 5, 150, 1).name('fly speed');
  fPlayer.add(player, 'invincible').name('invincible');

  // --- Physics -------------------------------------------------------------
  const fPhys = gui.addFolder('Physics');
  const apex = { get value() {
    return `${(TUNING.JUMP_SPEED ** 2 / (2 * TUNING.GRAVITY_UP)).toFixed(1)} m`;
  } };
  fPhys.add(TUNING, 'JUMP_SPEED', 20, 150, 1).name('jump speed');
  fPhys.add(apex, 'value').name('jump apex').listen().disable();
  fPhys.add(TUNING, 'WALK_SPEED', 1, 30, 0.5).name('walk speed');
  fPhys.add(TUNING, 'SPRINT_SPEED', 5, 100, 1).name('sprint speed');
  fPhys.add(TUNING, 'AIR_SPEED', 5, 100, 1).name('air speed');
  fPhys.add(TUNING, 'GRAVITY_UP', 5, 200, 1).name('gravity (rising)');
  fPhys.add(TUNING, 'GRAVITY_DOWN', 5, 200, 1).name('gravity (falling)');
  fPhys.add(TUNING, 'DASH_SPEED', 0, 150, 1).name('dash speed');
  fPhys.add(TUNING, 'TERMINAL_VELOCITY', 50, 300, 5).name('terminal velocity');
  fPhys.add(TUNING, 'CLOUD_DRAG', 0, 5, 0.1).name('cloud drag');
  fPhys.add(TUNING, 'CLOUD_AIR_ACCEL', 0, 60, 1).name('cloud air accel');
  fPhys.add(TUNING, 'BOUNCE_VY', 60, 160, 1).name('bounce launch');
  fPhys.add({ reset: () => {
    Object.assign(TUNING, TUNING_DEFAULTS);
    gui.controllersRecursive().forEach((c) => c.updateDisplay());
  } }, 'reset').name('reset physics');

  // --- Sun -----------------------------------------------------------------
  const fSun = gui.addFolder('Sun');
  const sunState = { rays: true, eat: true };
  fSun.add(sunState, 'rays').name('ray attacks').onChange((v) => sunRays.setEnabled(v));
  fSun.add(state, 'rayCooldown', 0, 15, 0.5).name('cooldown (0=auto)')
    .onChange((v) => sunRays.setCooldownOverride(v));
  fSun.add({ fire: () => sunRays.forceFire() }, 'fire').name('fire ray now');
  fSun.add(sunState, 'eat').name('eating allowed').onChange((v) => sun.setEatEnabled(v));
  fSun.add({ visit: () => sun.forceVisit() }, 'visit').name('force visit');
  fSun.add({ eclipse: () => eclipse.force() }, 'eclipse').name('force eclipse');

  // --- Audio ----------------------------------------------------------------
  const fAudio = gui.addFolder('Audio');
  const audioState = { muted: false, volume: 0.8 };
  fAudio.add(audioState, 'muted').name('mute (M)').onChange((v) => audio.setMuted(v));
  fAudio.add(audioState, 'volume', 0, 1, 0.05).name('volume').onChange((v) => audio.setVolume(v));

  function update() {
    if (!shown) return;
    state.level = getLevel();
    state.height = `${player.feetY().toFixed(1)} m`;
  }

  return { update, isOpen: () => shown };
}
