// Post-processing chain + camera "feel": drives the jump shader uniforms and
// a small FOV kick, all decaying exponentially. Subscribes to game events so
// it never touches the controller.
//
// Two render paths, one uniform set:
//   composer: true  — RenderPass -> JumpFX ShaderPass -> OutputPass, MSAA on
//                     the explicit target (HalfFloat only at 4x/high tier).
//   composer: false — direct renderer.render(); tone mapping still applies
//                     (three compiles it into materials when rendering to the
//                     canvas), the FOV kick is camera-side anyway, and the
//                     gameplay-critical veils (eaten-blackout, cloud whiteout)
//                     move to DOM overlays fed by the same decayed uniforms.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { JumpFXShader } from './jumpFXShader.js';
import { createScreenVeil } from './screenVeil.js';
import { on } from '../core/events.js';

const BASE_FOV = 75;

export function createPostFX(renderer, scene, camera, { composer: useComposer = true, samples = 4 } = {}) {
  const size = renderer.getSize(new THREE.Vector2());

  // uniforms live outside the composer so the event handlers below and the
  // DOM veil keep one stable object across path switches (governor downgrade)
  const u = THREE.UniformsUtils.clone(JumpFXShader.uniforms);
  u.uAspect.value = size.x / size.y;

  let composer = null;
  let veil = null;

  function buildComposer() {
    const pixelRatio = renderer.getPixelRatio();
    // explicit target with MSAA samples — EffectComposer's default has none.
    // HalfFloat is reserved for the 4x/high tier: half-float MSAA resolve is
    // slow or broken on many embedded GLES3 drivers.
    const target = new THREE.WebGLRenderTarget(size.x * pixelRatio, size.y * pixelRatio, {
      samples,
      type: samples >= 4 ? THREE.HalfFloatType : THREE.UnsignedByteType,
    });
    composer = new EffectComposer(renderer, target);
    composer.setPixelRatio(pixelRatio);
    composer.addPass(new RenderPass(scene, camera));
    composer.addPass(new ShaderPass(new THREE.ShaderMaterial({
      name: JumpFXShader.name,
      uniforms: u,
      vertexShader: JumpFXShader.vertexShader,
      fragmentShader: JumpFXShader.fragmentShader,
    })));
    composer.addPass(new OutputPass());
  }

  if (useComposer) buildComposer();
  else veil = createScreenVeil();

  let fovKick = 0;
  let speedFov = 0; // widened FOV while sprinting

  on('jump', () => {
    u.uPulse.value = 1.0;
    fovKick += 9; // launch punch
  });
  on('land', ({ intensity, fx }) => {
    if (!fx) return;
    u.uThump.value = Math.min(0.35 + 0.75 * intensity, 1);
    fovKick -= 8 * intensity; // impact slam
  });
  on('respawn', () => {
    u.uThump.value = 0.5;
  });
  on('dash', () => {
    u.uPulse.value = 1.0;
    u.uDashAir.value = 1.0; // horizontal air burst
    fovKick += 12; // the dash punch
  });
  on('scare', () => {
    u.uThump.value = 0.55; // the flinch
    fovKick -= 7;
  });
  on('sunray', ({ phase }) => {
    if (phase === 'fire') u.uPulse.value = Math.max(u.uPulse.value, 0.6);
  });
  on('rayhit', () => {
    u.uThump.value = 0.9; // the blast
    fovKick -= 10;
  });
  on('bounce', () => {
    u.uPulse.value = 1.0;
    fovKick += 14; // the launch
  });
  let swallowTarget = 0;
  on('eaten', () => { swallowTarget = 1; }); // the maw closes over the screen
  on('respawn', () => { swallowTarget = 0; });
  let cloudTarget = 0;
  on('cloudenter', () => { cloudTarget = 1; });
  on('cloudexit', () => { cloudTarget = 0; });
  on('respawn', () => { cloudTarget = 0; });

  function render(dt, speedFovTarget = 0, rushTarget = 0, verticalVel = 0) {
    u.uPulse.value *= Math.exp(-6 * dt);
    u.uThump.value *= Math.exp(-5 * dt);
    // wind rush follows fall speed: fast attack, fast release
    u.uRush.value += (rushTarget - u.uRush.value) * (1 - Math.exp(-8 * dt));

    // air streaks: scroll phase accumulates WITH vertical velocity, so the
    // streaks stream downward while you rise and upward while you fall —
    // the air visibly rushes past in the correct direction
    u.uAirOff.value += verticalVel * dt * 0.045;
    const airTarget = Math.min(Math.max((Math.abs(verticalVel) - 12) / 55, 0), 1);
    u.uAir.value += (airTarget - u.uAir.value) * (1 - Math.exp(-9 * dt));
    if (airTarget === 0 && u.uAir.value < 0.02) u.uAirOff.value = 0; // float hygiene

    // being swallowed: fast to black, gentle release after respawn
    u.uSwallow.value += (swallowTarget - u.uSwallow.value)
      * (1 - Math.exp((swallowTarget > u.uSwallow.value ? -14 : -4) * dt));

    // cloud veil: quick white-in, softer clear-out
    u.uCloud.value += (cloudTarget - u.uCloud.value)
      * (1 - Math.exp((cloudTarget > u.uCloud.value ? -10 : -5) * dt));

    // dash burst: horizontal streaks flare then die with the dash surplus
    u.uDashAir.value *= Math.exp(-2.2 * dt);
    if (u.uDashAir.value > 0.01) u.uDashOff.value += dt * 3.2;
    else u.uDashOff.value = 0;

    fovKick *= Math.exp(-8 * dt);
    speedFov += (speedFovTarget - speedFov) * (1 - Math.exp(-6 * dt));
    const fov = BASE_FOV + fovKick + speedFov + 10 * u.uRush.value;
    if (Math.abs(camera.fov - fov) > 0.01) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }

    if (composer) {
      composer.render();
    } else {
      renderer.render(scene, camera);
      veil.update(u.uSwallow.value, u.uCloud.value);
    }
  }

  function setSize(width, height) {
    size.set(width, height);
    u.uAspect.value = width / height;
    if (!composer) return;
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(width, height);
  }

  // governor hook: drop to the direct path at runtime, reclaiming the
  // composer's render-target VRAM
  function setEnabled(enable) {
    if (enable && !composer) {
      buildComposer();
    } else if (!enable && composer) {
      composer.dispose();
      composer = null;
      if (!veil) veil = createScreenVeil();
    }
  }

  return { render, setSize, setEnabled };
}
