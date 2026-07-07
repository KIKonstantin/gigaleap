// Emissive glow pulse on the platform you just landed on, decaying back to
// its base (0 for normal platforms, constant glow for checkpoints/goal).
import { on } from '../core/events.js';

export function createPlatformPulse() {
  const active = new Set();

  on('land', ({ fx, intensity, platform }) => {
    if (!fx) return;
    platform.material.emissiveIntensity =
      platform.baseEmissive + 0.25 + 0.85 * intensity;
    active.add(platform);
  });

  function update(dt) {
    for (const platform of active) {
      const excess =
        (platform.material.emissiveIntensity - platform.baseEmissive) *
        Math.exp(-4 * dt);
      platform.material.emissiveIntensity = platform.baseEmissive + excess;
      if (excess < 0.01) {
        platform.material.emissiveIntensity = platform.baseEmissive;
        active.delete(platform);
      }
    }
  }

  return { update };
}
