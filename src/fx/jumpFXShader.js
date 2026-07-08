// Full-screen jump/landing shader: chromatic aberration + radial blur +
// vignette. uPulse spikes on jump, uThump on landing/respawn; both decay
// in postfx.js. uRush tracks fall speed continuously — the wind-rush of a
// heavy descent. All effects scale with distance from screen center so the
// middle of the view stays readable.
export const JumpFXShader = {
  name: 'JumpFXShader',

  uniforms: {
    tDiffuse: { value: null },
    uPulse: { value: 0 },
    uThump: { value: 0 },
    uRush: { value: 0 },
    uAir: { value: 0 }, // wind-streak strength, follows |vertical speed|
    uAirOff: { value: 0 }, // scroll phase, accumulates WITH vertical velocity
    uDashAir: { value: 0 }, // horizontal streak burst, spikes on dash
    uDashOff: { value: 0 }, // horizontal scroll phase
    uSwallow: { value: 0 }, // 1 = inside the sun. good night.
    uCloud: { value: 0 }, // white veil while inside a drag cloud
    uAspect: { value: 1 },
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uPulse;
    uniform float uThump;
    uniform float uRush;
    uniform float uAir;
    uniform float uAirOff;
    uniform float uDashAir;
    uniform float uDashOff;
    uniform float uSwallow;
    uniform float uCloud;
    uniform float uAspect;
    varying vec2 vUv;

    float hash(float n) {
      return fract(sin(n * 127.1) * 43758.5453);
    }

    void main() {
      vec2 centered = vUv - 0.5;
      vec2 dir = centered * vec2(uAspect, 1.0);
      float d = length(dir);
      vec2 ndir = d > 0.0001 ? dir / d : vec2(0.0);

      // chromatic aberration, offsets back in UV space
      float k = (0.006 * uPulse + 0.012 * uThump + 0.005 * uRush) * d;
      vec2 caOff = ndir * k / vec2(uAspect, 1.0);
      vec3 col = vec3(
        texture2D(tDiffuse, vUv + caOff).r,
        texture2D(tDiffuse, vUv).g,
        texture2D(tDiffuse, vUv - caOff).b
      );

      // radial blur: hard landings thump it, fast falls stream it
      float blurAmt = 0.05 * uThump + 0.035 * uRush;
      if (blurAmt > 0.002) {
        vec3 blur = vec3(0.0);
        for (int i = 1; i <= 5; i++) {
          vec2 uv2 = vUv - centered * (blurAmt * d) * float(i) / 5.0;
          blur += texture2D(tDiffuse, uv2).rgb;
        }
        blur /= 5.0;
        float mixAmt = clamp(uThump * 0.85 + uRush * 0.4, 0.0, 1.0);
        col = mix(col, blur, mixAmt * smoothstep(0.05, 0.6, d));
      }

      // vignette: faint always, deepens on thump and while plummeting
      col *= 1.0 - smoothstep(0.45, 0.95, d) * (0.06 + 0.3 * uThump + 0.16 * uRush);

      // AIR: subtle vertical wind streaks while rising or falling. Columns
      // of short dashes scroll against your motion (uAirOff is accumulated
      // from vertical velocity on the CPU), kept sparse and near the screen
      // edges so the center stays clean.
      if (uAir > 0.01) {
        float colId = floor(vUv.x * 70.0);
        float on = step(0.68, hash(colId));            // ~32% of columns carry a streak
        float speedVar = 0.7 + 0.6 * hash(colId + 47.0);
        float yy = vUv.y * (1.5 + 2.0 * hash(colId + 13.0))
                 + uAirOff * speedVar + hash(colId + 7.0) * 10.0;
        float t = fract(yy);
        float dash = smoothstep(0.0, 0.08, t) * smoothstep(0.5, 0.2, t);
        // thin the line inside its column
        float xIn = fract(vUv.x * 70.0);
        float thin = smoothstep(0.0, 0.35, xIn) * smoothstep(1.0, 0.65, xIn);
        float edgeMask = smoothstep(0.32, 0.75, d);
        col += vec3(1.0) * on * dash * thin * edgeMask * uAir * 0.13;
      }

      // DASH AIR: horizontal streak rows during the dash burst, streaming
      // outward from the center toward both sides — air tearing past as you
      // punch forward.
      if (uDashAir > 0.01) {
        float rowId = floor(vUv.y * 70.0);
        float on = step(0.65, hash(rowId + 91.0));
        float speedVar = 0.7 + 0.6 * hash(rowId + 31.0);
        float u = abs(vUv.x - 0.5) * 2.0;
        float xx = u * (1.5 + 2.0 * hash(rowId + 57.0))
                 - uDashOff * speedVar + hash(rowId + 3.0) * 10.0;
        float t2 = fract(xx);
        float dash2 = smoothstep(0.0, 0.08, t2) * smoothstep(0.5, 0.2, t2);
        float yIn = fract(vUv.y * 70.0);
        float thin2 = smoothstep(0.0, 0.35, yIn) * smoothstep(1.0, 0.65, yIn);
        float sideMask = smoothstep(0.18, 0.55, abs(dir.x));
        col += vec3(1.0) * on * dash2 * thin2 * sideMask * uDashAir * 0.16;
      }

      // inside a cloud: white-out from the edges, center stays readable
      col = mix(col, vec3(0.94, 0.96, 0.98), uCloud * (0.12 + 0.28 * smoothstep(0.1, 0.8, d)));

      // swallowed: the world goes dark from the edges inward (wins over cloud)
      col = mix(col, vec3(0.03, 0.03, 0.05), uSwallow * (0.55 + 0.45 * smoothstep(0.0, 0.7, d)));

      gl_FragColor = vec4(col, 1.0);
    }
  `,
};
