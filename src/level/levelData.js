// Level definition — pure data, no three.js imports (node-testable).
// The course is generated once from a fixed seed, so the level is identical
// every run. Every gap is placed within jump reach computed from the
// controller's real HEAVY hulk physics: asymmetric gravity (35 up / 70 down),
// jump 88 m/s, sprint 35 — ~100 m leaps that last ~4.3 s.
//
// Placement wanders randomly (signed turns, mixed rises including flats and
// slight descents) instead of a tight spiral, so the course spreads out
// horizontally. Some nodes are crumbling BRIDGES: 8-10 square segments in an
// axis-aligned line with 0.3 m cracks (narrower than the player, so intact
// bridges run seamlessly). Segments drop 0.55 s after being touched — you
// sprint across or you fall (see crumble.js).
//
// Moving platforms swing around their base position; their amplitude (and
// the previous platform's) is subtracted from the allowed gap so every jump
// stays makeable at the movers' worst positions.
//
// Anti-tunneling contract: every thickness >= 2.5 (terminal velocity 130).

const JUMP_SPEED = 88;
const GRAVITY_UP = 35;
const GRAVITY_DOWN = 70;
const SPRINT_SPEED = 35;
const APEX = (JUMP_SPEED * JUMP_SPEED) / (2 * GRAVITY_UP); // ~110.6 m

const CLIMB_COUNT = 40;
const CHECKPOINT_EVERY = 8;
// the finale: the last nodes leave the random wander and orbit the SUN.
// The orbit is the GAUNTLET — the hardest stretch of the game: unstable
// platforms that drop if you camp on them, dash-only hops between them, and
// one final dash onto the gold. Plan is hand-tuned; angles/radii chosen so
// wrap-around nodes never stack within head-bonk range (verified by the
// level validator).
const RING_COUNT = 9;
const RING_R = 130;
const RING_PLAN = [
  { step: 45, dr: 0, rise: 18, kind: 'plain' }, // entry breather
  { step: 45, dr: 0, rise: 16, kind: 'unstable' },
  { step: 80, dr: 0, rise: 6, kind: 'dash' },
  { step: 45, dr: 0, rise: 18, kind: 'unstable' },
  { step: 80, dr: 0, rise: 6, kind: 'dash' },
  { step: 45, dr: 0, rise: 18, kind: 'unstable' },
  { step: 80, dr: 0, rise: 6, kind: 'dash' },
  { step: 45, dr: 25, rise: 18, kind: 'plain' }, // LEVEL 6 checkpoint
  { step: 64, dr: 20, rise: 4, kind: 'dash' }, // the goal: one last dash
];

const PALETTE = [0x8ecae6, 0xa8dadc, 0xcdb4db, 0xffc8dd, 0xbde0fe, 0xffd6a5];
const CHECKPOINT_COLOR = 0x95d5b2;
const GOAL_COLOR = 0xffd166;
const BRIDGE_COLOR = 0xe89c94; // warm coral — reads as "danger" in the palette
const DASH_COLOR = 0x9d8df1; // periwinkle — the "you need the dash" signal
const UNSTABLE_COLOR = 0xb8a398; // brittle grey-brown — it will not hold you long

const SEG = 9; // bridge segments are square, flat, and axis-aligned
const CRACK = 0.3; // narrower than the player (0.7) — can't fall in or snag

// Max horizontal distance clearable when landing `rise` meters higher,
// taking off at full sprint. Rise and fall use different gravities.
function jumpRange(rise) {
  if (rise >= APEX) return 0;
  const tUp = JUMP_SPEED / GRAVITY_UP;
  const tDown = Math.sqrt((2 * (APEX - rise)) / GRAVITY_DOWN);
  return SPRINT_SPEED * (tUp + tDown);
}

function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function buildLevel() {
  const rand = lcg(20260707);
  const platforms = [
    { pos: [0, -1.5, 0], size: [30, 3, 30], color: PALETTE[0], checkpoint: true },
  ];

  let x = 0, y = 0, z = 0; // top-center of the previous platform
  let ring = null; // set when the course reaches the sun orbit
  let prevHalf = 15;
  let heading = Math.PI; // walk toward -Z first (player spawns facing -Z)
  let easySteps = 2; // gentler jumps right after a checkpoint
  let moverSlot = 0;
  let bridgeSlot = 0;
  let dashSlot = 0;
  let unstableSlot = 0;
  let prevAmp = 0, prevVertAmp = 0;
  let prevNoDash = false; // no dash aim from a crumbling exit or unstable ground

  for (let i = 1; i <= CLIMB_COUNT + 1; i++) {
    const isGoal = i === CLIMB_COUNT + 1;
    const isCheckpoint = !isGoal && i % CHECKPOINT_EVERY === 0;
    const p = Math.min(i / CLIMB_COUNT, 1); // difficulty progress 0..1

    // ---- the sun orbit gauntlet: final nodes circle the sun's anchor ----
    if (i > CLIMB_COUNT + 1 - RING_COUNT) {
      if (!ring) {
        // center perpendicular-left of the heading, so the previous
        // platform sits exactly on the circle
        const cx = x + Math.cos(heading) * RING_R;
        const cz = z - Math.sin(heading) * RING_R;
        const theta = Math.atan2(z - cz, x - cx);
        // rotate whichever way continues the current direction of travel
        const dir = (-Math.sin(theta) * Math.sin(heading) + Math.cos(theta) * Math.cos(heading)) > 0 ? 1 : -1;
        ring = { cx, cz, theta, dir, r: RING_R, startY: y, idx: 0 };
      }
      const node = RING_PLAN[ring.idx++];
      ring.theta += (node.step * Math.PI / 180) * ring.dir;
      ring.r += node.dr;
      y += node.rise + rand() * 2;
      x = ring.cx + Math.cos(ring.theta) * ring.r;
      z = ring.cz + Math.sin(ring.theta) * ring.r;

      const isDash = node.kind === 'dash' && !isCheckpoint;
      const isUnstable = node.kind === 'unstable' && !isCheckpoint && !isGoal;
      const width = isGoal ? 15 : isCheckpoint ? 16
        : isDash ? 9 : isUnstable ? 8.5 : 9.5 + rand();
      const thickness = isGoal ? 3 : 2.5 + rand() * 0.8;
      const color = isGoal ? GOAL_COLOR : isCheckpoint ? CHECKPOINT_COLOR
        : isDash ? DASH_COLOR : isUnstable ? UNSTABLE_COLOR
        : PALETTE[Math.floor(Math.max(y, 0) / 150) % PALETTE.length];
      const def = {
        pos: [round2(x), round2(y - thickness / 2), round2(z)],
        size: [round2(width), round2(thickness), round2(width)],
        color,
      };
      if (isCheckpoint) def.checkpoint = true;
      if (isGoal) {
        def.goal = true;
        def.dash = true; // the last leap is dash-only
      }
      if (isDash && !isGoal) def.dash = true;
      if (isUnstable) def.unstable = true;
      platforms.push(def);
      prevHalf = width / 2;
      prevAmp = 0;
      prevVertAmp = 0;
      continue;
    }

    // wander: signed random turn each node instead of a fixed spiral
    heading += (rand() - 0.5) * 2 * (0.35 + rand() * 0.75); // up to ~63 deg

    const eligible = !isGoal && !isCheckpoint && easySteps <= 0 && i > 4;

    // ---- crumbling sprint-bridge node ----
    if (eligible && ++bridgeSlot % 6 === 3) {
      // snap to the nearest compass axis: segments are axis-aligned boxes
      heading = Math.round(heading / (Math.PI / 2)) * (Math.PI / 2);
      const ux = Math.round(Math.sin(heading));
      const uz = Math.round(Math.cos(heading));
      const segCount = 8 + Math.floor(rand() * 3);
      const thickness = 2.6 + rand() * 0.4;

      // entry jump onto the first segment, then a flat run of squares
      const rise = 8 + rand() * 12;
      const gap = Math.min(60 + rand() * 30, jumpRange(rise) - (50 - 20 * p));
      x += ux * (prevHalf + gap + SEG / 2);
      z += uz * (prevHalf + gap + SEG / 2);
      y += rise;

      for (let k = 0; k < segCount; k++) {
        if (k > 0) {
          x += ux * (SEG + CRACK);
          z += uz * (SEG + CRACK);
        }
        platforms.push({
          pos: [round2(x), round2(y - thickness / 2), round2(z)],
          size: [SEG, round2(thickness), SEG],
          color: BRIDGE_COLOR,
          crumble: true,
        });
      }
      prevHalf = SEG / 2;
      prevAmp = 0;
      prevVertAmp = 0;
      prevNoDash = true; // the exit segment is crumbling under you — no dash aim
      continue;
    }

    // dash-only gaps: placed just BEYOND max jump range, reachable only with
    // the Ctrl air-dash. Never after a mover (its sway would stack on top)
    // and never off crumbling/unstable ground (no time to line up the aim).
    const isDash = eligible && prevAmp === 0 && prevVertAmp === 0
      && !prevNoDash && ++dashSlot % 4 === 2;
    // roughly every 3rd eligible platform moves; every 3rd mover is vertical
    const isMover = eligible && !isDash && ++moverSlot % 3 === 0;
    const isVertical = isMover && moverSlot % 9 === 0;
    const amp = isMover && !isVertical ? 25 + rand() * 20 : 0;
    const vertAmp = isVertical ? 15 + rand() * 10 : 0;
    // brittle nodes: stand longer than 2 s and they let go (see unstable.js)
    const isUnstable = eligible && !isDash && !isMover && ++unstableSlot % 3 === 1;

    // mixed rises: mostly climbs, some near-flats, occasional slight descents
    const roll = rand();
    let rise = roll < 0.15 ? -12 + rand() * 8
      : roll < 0.4 ? 4 + rand() * 10
      : 18 + rand() * (20 + 8 * p);
    if (vertAmp) rise = Math.min(rise, 45); // keep worst-case rise jumpable
    let gap = 80 + rand() * 40 + 40 * p;
    if (easySteps > 0 || isCheckpoint || isGoal) {
      rise = Math.min(rise, 25);
      gap = Math.min(gap, 90);
      easySteps--;
    }
    if (isDash) {
      rise = 4 + rand() * 8; // dashes are horizontal — keep the rise gentle
      gap = jumpRange(rise) + 14 + rand() * 8; // beyond jump range, within dash range
    } else {
      // hard reachability clamp at the movers' worst positions, with a safety
      // margin that shrinks as skill grows
      const margin = 50 - 20 * p + amp + prevAmp;
      gap = Math.min(gap, jumpRange(rise + vertAmp + prevVertAmp) - margin);
    }

    const width = isGoal ? 15 : isCheckpoint ? 16
      : (isDash ? 16 : isUnstable ? 12 : 14) - 5.5 * p + (rand() - 0.5) * 2;
    const half = width / 2;
    const thickness = isGoal ? 3 : 2.5 + rand() * 0.8;

    const dist = prevHalf + gap + half;
    x += Math.sin(heading) * dist;
    z += Math.cos(heading) * dist;
    y += rise;

    const color = isGoal ? GOAL_COLOR : isCheckpoint ? CHECKPOINT_COLOR
      : isDash ? DASH_COLOR : isUnstable ? UNSTABLE_COLOR
      : PALETTE[Math.floor(Math.max(y, 0) / 150) % PALETTE.length];

    const def = {
      pos: [round2(x), round2(y - thickness / 2), round2(z)],
      size: [round2(width), round2(thickness), round2(width)],
      color,
    };
    if (isCheckpoint) def.checkpoint = true;
    if (isGoal) def.goal = true;
    if (isDash) def.dash = true;
    if (isUnstable) def.unstable = true;
    if (isMover) {
      // horizontal movers sway perpendicular to the approach direction
      const dir = isVertical
        ? [0, 1, 0]
        : [round2(Math.cos(heading)), 0, round2(-Math.sin(heading))];
      def.move = {
        dir,
        amplitude: round2(amp || vertAmp),
        period: round2(10 + rand() * 7), // slow, heavy islands
        phase: round2(rand() * Math.PI * 2),
      };
    }
    platforms.push(def);

    if (isCheckpoint) easySteps = 2;
    prevHalf = half;
    prevAmp = amp;
    prevVertAmp = vertAmp;
    prevNoDash = isUnstable;
  }

  // the sun's world anchor: the center of the orbit, mid-climb height
  const sunAnchor = [round2(ring.cx), round2(ring.startY + 85), round2(ring.cz)];
  return { platforms, sunAnchor };
}

function round2(v) {
  return Math.round(v * 100) / 100;
}

const built = buildLevel();
export const PLATFORMS = built.platforms;
export const SUN_ANCHOR = built.sunAnchor;
