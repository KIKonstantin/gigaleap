// Home/pause menu on the start overlay: PLAY, QUALITY, CONTROLS.
// The overlay itself no longer locks the pointer — PLAY requests it
// explicitly (input.js only locks direct canvas clicks). Quality applies by
// saving the tier and reloading: most knobs are boot-time (sea grid,
// materials, MSAA target, merged clouds), so a reload is the only honest
// switch — confirmed first when a run would be lost.
import { saveQuality } from '../core/quality.js';

export function createMenu({ canvas, tier, isRunActive }) {
  const controlsOverlay = document.getElementById('controlsOverlay');

  document.getElementById('menuPlay').addEventListener('click', () => {
    canvas.requestPointerLock();
  });

  document.getElementById('menuControls').addEventListener('click', () => {
    controlsOverlay.classList.remove('hidden');
  });
  document.getElementById('controlsBack').addEventListener('click', () => {
    controlsOverlay.classList.add('hidden');
  });

  for (const el of document.querySelectorAll('#menuQuality .q-opt')) {
    if (el.dataset.tier === tier) el.classList.add('active');
    el.addEventListener('click', () => {
      const next = el.dataset.tier;
      if (next === tier) return;
      if (isRunActive() &&
        !window.confirm('Changing quality restarts your run. Continue?')) return;
      saveQuality(next);
      // a ?quality= param outranks the saved choice — drop it so the
      // selection actually takes effect on the reload
      const url = new URL(window.location.href);
      url.searchParams.delete('quality');
      window.location.replace(url.toString());
    });
  }

  return {
    hideDialogs: () => controlsOverlay.classList.add('hidden'),
  };
}
