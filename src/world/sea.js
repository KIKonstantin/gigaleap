// Low-poly sea at the bottom of the world. CPU-displaced sine waves on a
// coarse plane; flatShading derives face normals in the fragment shader, so
// only positions update per frame. The mesh follows the player (like the old
// void-cover floor) but waves are sampled in WORLD space, so the surface
// doesn't slide along with you.
//
// Weather follows progress: chill through level 6, then the storm rolls in —
// taller, faster, choppier waves and a darker water color. You mostly meet
// the sea while falling, which is precisely when it should look angry.
import * as THREE from 'three';

const SIZE = 3200;
const SEGS = 80;
// The run STARTS at sea level: the pad (top y=0, underside -3) floats in the
// water, calm crests (~5 m) lapping just below its top edge.
const BASE_Y = -6;
// Never sink more than this below the CHECKPOINT you're climbing from: past
// the fog the real bottom is invisible anyway, so from the heights the sea
// rides along underneath — close enough that a dark storm looms through the
// haze (fog is 100..700, so at ~480 m the surface keeps ~40% of its color).
// Anchoring to the checkpoint (not the player) keeps the surface rock-still
// during jumps, and falls genuinely close in on the water. It glides to a
// new depth only on level-ups and respawns, too slowly to notice.
const FOLLOW = 480;
const CALM_COLOR = new THREE.Color(0x9fd8dc);
const ROUGH_COLOR = new THREE.Color(0x1d3c52);
const STORM_FROM_LEVEL = 6; // calm through here, ramps to full storm at 9

function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function createSea(scene, { getLevel }) {
  const geometry = new THREE.PlaneGeometry(SIZE, SIZE, SEGS, SEGS);
  geometry.rotateX(-Math.PI / 2);

  // break the grid once: static XZ jitter makes the facets read as water,
  // not as a displaced checkerboard
  const pos = geometry.attributes.position;
  const rand = lcg(31337);
  const cell = SIZE / SEGS;
  for (let i = 0; i < pos.count; i++) {
    pos.setX(i, pos.getX(i) + (rand() - 0.5) * cell * 0.45);
    pos.setZ(i, pos.getZ(i) + (rand() - 0.5) * cell * 0.45);
  }

  const material = new THREE.MeshStandardMaterial({
    color: CALM_COLOR.clone(),
    flatShading: true,
    roughness: 0.75,
    metalness: 0,
    side: THREE.DoubleSide, // brief underwater frames read as a water ceiling
  });
  // cap the fog's bite on the sea so the water never fully vanishes into the
  // haze. The cap rides the storm: calm water melts into the fog like
  // everything else, but a raging sea punches through it — visible as a dark
  // mass from the tower top, with the capped gradient doubling as an ocean
  // horizon. Same draw call, the per-fragment fog math was already there.
  const seaFogCap = { value: 0.78 };
  const stormMix = { value: 0 };
  const deepColor = { value: new THREE.Color(0x0d2c47) };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uSeaFogCap = seaFogCap;
    shader.uniforms.uStormMix = stormMix;
    shader.uniforms.uSeaDeep = deepColor;
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <fog_pars_fragment>',
        '#include <fog_pars_fragment>\nuniform float uSeaFogCap;\nuniform float uStormMix;\nuniform vec3 uSeaDeep;'
      )
      .replace(
        '#include <fog_fragment>',
        `// the scene lighting overdrives dark albedos — during a storm pull
        // the LIT color toward deep navy, keeping half the facet shading
        gl_FragColor.rgb = mix(gl_FragColor.rgb, uSeaDeep, uStormMix);
        #ifdef USE_FOG
          float seaFog = smoothstep(fogNear, fogFar, vFogDepth) * uSeaFogCap;
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, seaFog);
        #endif`
      );
  };
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = BASE_Y;
  scene.add(mesh);

  let storm = 0; // 0 = chill, 1 = level-9 rage

  function update(time, dt, playerPos, checkpointTop) {
    mesh.position.x = playerPos.x;
    mesh.position.z = playerPos.z;
    const targetY = Math.max(BASE_Y, checkpointTop - FOLLOW);
    if (targetY < mesh.position.y - 60) {
      // restart / teleport far down: snap, or the start pad would sit
      // underwater while the elevated sea glides back
      mesh.position.y = targetY;
    } else {
      mesh.position.y += (targetY - mesh.position.y) * (1 - Math.exp(-0.4 * dt));
    }

    // the weather changes like weather — slowly
    const target = Math.min(Math.max((getLevel() - STORM_FROM_LEVEL) / 3, 0), 1);
    storm += (target - storm) * (1 - Math.exp(-0.6 * dt));

    const swell = 3.5 + 11 * storm; // long rolling waves
    const chop = 1.6 + 6.5 * storm; // short angry ones
    const speed = 0.5 + 1.3 * storm;
    // storm chop tightens: steeper facets catch the light even from far above
    const cf = 0.031 + 0.013 * storm;
    for (let i = 0; i < pos.count; i++) {
      const wx = pos.getX(i) + mesh.position.x;
      const wz = pos.getZ(i) + mesh.position.z;
      const y =
        swell * Math.sin(wx * 0.012 + time * speed)
          * Math.cos(wz * 0.010 + time * speed * 0.8) +
        chop * Math.sin(wx * cf - time * speed * 1.7)
          * Math.cos(wz * cf * 0.87 + time * speed * 1.3);
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
    material.color.copy(CALM_COLOR).lerp(ROUGH_COLOR, storm);
    seaFogCap.value = 0.78 - 0.48 * storm; // the storm burns through the haze
    stormMix.value = 0.5 * storm; // and swallows the light
  }

  return { update, storm: () => storm, seaLevel: () => mesh.position.y };
}
