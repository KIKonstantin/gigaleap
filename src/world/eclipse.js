// The eclipse — from level 8 the sun periodically GOES OUT. A short warning
// shiver, then ~4.5 s of darkness: the lights die, the sky turns dusk-navy,
// and everything emissive (checkpoints, dash targets, the goal beacon, the
// warning glow of unstable platforms) suddenly matters. Sun ray attacks are
// suppressed while it's dark — the eclipse is also your breather.
//
// Cycle: IDLE (cooldown, ticks only at level 8+, sun not busy)
//     -> WARN 1.2 s -> DARK 4.5 s -> RESTORE 1.5 s -> IDLE
import { emit } from '../core/events.js';

const ACTIVE_LEVEL = 8;
const COOLDOWN = 22; // + up to 8 s jitter
const WARN_TIME = 1.2;
const DARK_TIME = 4.5;
const RESTORE_TIME = 1.5;

export function createEclipse({ setDaylight, sun, getLevel }) {
  let phase = 'idle';
  let timer = 0;
  let cooldown = COOLDOWN;
  let f = 1; // daylight 0..1
  let dim = 0; // sun-face darkness 0..1
  let fShown = -1;

  const busy = () => sun.isVisiting() || sun.isEating();
  const rollCooldown = () => COOLDOWN + Math.random() * 8;

  function apply() {
    // only touch uniforms/lights when the value actually moves
    if (Math.abs(f - fShown) > 0.001) {
      setDaylight(f);
      fShown = f;
    }
    sun.setDim(dim);
  }

  function toIdle() {
    phase = 'idle';
    timer = 0;
    cooldown = rollCooldown();
  }

  function update(dt, active) {
    const lerpTo = (v, target, rate) =>
      v + (target - v) * (1 - Math.exp(-rate * dt));

    if (phase === 'idle') {
      // ease back to full day if we aborted mid-phase
      f = lerpTo(f, 1, 3);
      dim = lerpTo(dim, 0, 3);
      apply();
      if (!active || getLevel() < ACTIVE_LEVEL || busy()) return;
      cooldown -= dt;
      if (cooldown <= 0) {
        phase = 'warn';
        timer = 0;
        emit('eclipse', { phase: 'warn' });
      }
      return;
    }

    if (!active || (phase === 'warn' && busy())) {
      // pause or a sun visit mid-warning: stand down, retry soon
      toIdle();
      cooldown = 5;
      return;
    }

    timer += dt;

    if (phase === 'warn') {
      const t = Math.min(timer / WARN_TIME, 1);
      dim = 0.4 * t;
      f = 1 - 0.15 * t;
      apply();
      if (timer >= WARN_TIME) {
        phase = 'dark';
        timer = 0;
        emit('eclipse', { phase: 'dark' });
      }
    } else if (phase === 'dark') {
      f = lerpTo(f, 0, 9); // the plunge
      dim = lerpTo(dim, 1, 9);
      apply();
      if (timer >= DARK_TIME) {
        phase = 'restore';
        timer = 0;
        emit('eclipse', { phase: 'end' });
      }
    } else if (phase === 'restore') {
      f = lerpTo(f, 1, 3);
      dim = lerpTo(dim, 0, 3);
      apply();
      if (timer >= RESTORE_TIME) {
        f = 1;
        dim = 0;
        apply();
        toIdle();
      }
    }
  }

  function reset() {
    f = 1;
    dim = 0;
    apply();
    if (phase !== 'idle') emit('eclipse', { phase: 'end' });
    toIdle();
  }

  return {
    update,
    reset,
    isDark: () => phase === 'dark',
    phase: () => phase,
    force: () => {
      if (phase === 'idle' && !busy()) {
        phase = 'warn';
        timer = 0;
        emit('eclipse', { phase: 'warn' });
      }
    },
  };
}
