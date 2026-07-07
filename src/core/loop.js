// Fixed-timestep accumulator: physics at a stable 60 Hz, rendering at display
// rate with an interpolation alpha so 120/144 Hz displays stay smooth.
const STEP = 1 / 60;
const MAX_DELTA = 0.1; // clamp after tab-switch: no spiral of death

export function startLoop({ update, render }) {
  let last = performance.now();
  let accumulator = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const delta = Math.min((now - last) / 1000, MAX_DELTA);
    last = now;

    accumulator += delta;
    while (accumulator >= STEP) {
      update(STEP);
      accumulator -= STEP;
    }
    render(delta, accumulator / STEP);
  }

  requestAnimationFrame(frame);
}
