// Quality tiers for constrained devices (smart displays, Pi-class GPUs).
// One frozen table, resolved once at boot: URL param -> saved downgrade ->
// hardware heuristic. Options flow into the THREE-side factories only — the
// pure-JS physics modules never see a tier, so gameplay is identical on a
// fridge and a gaming rig.
export const TIER_ORDER = ['low', 'med', 'high'];

export const TIERS = Object.freeze({
  high: Object.freeze({
    pixelRatio: 2, shadows: true, shadowMapSize: 2048, shadowRadius: 4,
    composer: true, msaaSamples: 4,
    seaSegs: 80, rainCount: 1800, decoClouds: 20, skySegs: 48, lambert: false,
  }),
  med: Object.freeze({
    pixelRatio: 1.5, shadows: true, shadowMapSize: 1024, shadowRadius: 2,
    composer: true, msaaSamples: 2,
    seaSegs: 64, rainCount: 900, decoClouds: 12, skySegs: 48, lambert: false,
  }),
  low: Object.freeze({
    // 0.75 is deliberately sub-native: fill rate is the #1 lever on
    // embedded GPUs, and the soft upscale reads fine at couch distance
    pixelRatio: 0.75, shadows: false, shadowMapSize: 512, shadowRadius: 1,
    composer: false, msaaSamples: 0,
    seaSegs: 48, rainCount: 400, decoClouds: 8, skySegs: 24,
    lambert: true, mergeDeco: true,
  }),
});

const SAVED_KEY = 'gigaleap.quality';

// Embedded/soft renderers and old mobile GPUs that can't hold 30 fps on the
// full pipeline. Mali-T and Mali-4xx are the Pi/set-top generation; modern
// Mali-G and Adreno 5xx+ pass through to the UA/memory heuristic instead.
const WEAK_GPU = /videocore|llvmpipe|swiftshader|softpipe|mali-[t4]|powervr|adreno [1-4]\d\d/;

function detectTier(renderer) {
  let gpu = '';
  try {
    const gl = renderer.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    gpu = String(
      gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || ''
    ).toLowerCase();
  } catch {
    // no context info — fall through to the UA/memory heuristic
  }
  if (WEAK_GPU.test(gpu)) return 'low';
  const mobile = /android|iphone|ipad|mobile/i.test(navigator.userAgent);
  const weak =
    (navigator.deviceMemory || 8) <= 4 && (navigator.hardwareConcurrency || 8) <= 4;
  if (mobile || weak) return 'med';
  return 'high';
}

export function pickQuality(renderer) {
  const url = new URLSearchParams(window.location.search).get('quality');
  if (TIERS[url]) return { tier: url, opts: TIERS[url], source: 'url' };
  let saved = null;
  try { saved = localStorage.getItem(SAVED_KEY); } catch { /* storage blocked */ }
  if (TIERS[saved]) return { tier: saved, opts: TIERS[saved], source: 'saved' };
  const tier = detectTier(renderer);
  return { tier, opts: TIERS[tier], source: 'auto' };
}

export function saveQuality(tier) {
  try { localStorage.setItem(SAVED_KEY, tier); } catch { /* storage blocked */ }
}

// Runtime safety net for devices the boot heuristic overestimated: average
// frame time over a rolling window (only while pointer-locked — menu frames
// idle at ~1 fps by design and would poison the average). Missing the 30 fps
// budget steps down ONE tier: the runtime-safe knobs apply immediately via
// the callback, the tier is persisted so the boot-only knobs (sea grid,
// material class, merged clouds, MSAA) land on the next load, and the
// warmup restarts so the shader-recompile hitch isn't judged.
export function createFrameGovernor(startTier, applyDowngrade) {
  const BUDGET_MS = 33.4; // 30 fps
  const WARMUP_FRAMES = 240;
  const WINDOW_FRAMES = 180;
  let tier = startTier;
  let warmup = WARMUP_FRAMES;
  let frames = 0;
  let accMs = 0;

  function sample(delta, active) {
    if (!active || tier === 'low') return;
    if (warmup > 0) { warmup--; return; }
    accMs += delta * 1000;
    if (++frames < WINDOW_FRAMES) return;
    const avg = accMs / frames;
    frames = 0;
    accMs = 0;
    if (avg > BUDGET_MS) {
      tier = TIER_ORDER[TIER_ORDER.indexOf(tier) - 1];
      saveQuality(tier);
      applyDowngrade(tier, TIERS[tier], avg);
      warmup = WARMUP_FRAMES;
    }
  }

  return { sample, tier: () => tier };
}
