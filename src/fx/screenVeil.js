// DOM stand-ins for the composer's gameplay-critical screen effects on the
// low tier (no post pass there): the eaten-blackout, the in-cloud whiteout,
// and a static vignette. Radial gradients keep the shader versions'
// "edges close in, center stays readable" character, and the compositor
// blends them for free. Inserted before #hud so they cover the canvas but
// never the HUD or overlays.
export function createScreenVeil() {
  const hud = document.getElementById('hud');
  const make = (background) => {
    const el = document.createElement('div');
    el.style.cssText =
      'position:fixed;inset:0;pointer-events:none;opacity:0;background:' + background;
    document.body.insertBefore(el, hud);
    return el;
  };

  const vignette = make(
    'radial-gradient(ellipse at center, rgba(0,0,0,0) 55%, rgba(0,0,0,0.16) 100%)'
  );
  vignette.style.opacity = '1'; // always on — replaces the shader's base vignette
  const cloud = make(
    'radial-gradient(ellipse at center, rgba(240,245,248,0.35) 20%, rgba(240,245,248,0.95) 100%)'
  );
  const swallow = make(
    'radial-gradient(ellipse at center, rgba(6,6,10,0.78) 0%, rgba(6,6,10,1) 70%)'
  );

  let sPrev = -1;
  let cPrev = -1;
  // driven by the same decayed uniform values the shader path uses; only
  // touch style when the value moved enough to see
  function update(swallowV, cloudV) {
    if (Math.abs(swallowV - sPrev) > 0.01) {
      swallow.style.opacity = swallowV.toFixed(3);
      sPrev = swallowV;
    }
    if (Math.abs(cloudV - cPrev) > 0.01) {
      cloud.style.opacity = (cloudV * 0.85).toFixed(3);
      cPrev = cloudV;
    }
  }

  return { update };
}
