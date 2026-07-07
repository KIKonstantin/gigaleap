# GIGALEAP

A first-person platformer about colossal leaps. Climb a wandering course of
pastel floating islands to the golden beacon — 110-meter jumps, 100-meter
gaps, crumbling sprint-bridges, moving platforms, and an air dash.

Built with [Three.js](https://threejs.org/) and a hand-tuned kinematic
character controller: asymmetric gravity (you fall much harder than you
rise), coyote time, jump buffering, variable jump height, and full air
control. All shader FX are custom — landing shockwaves, wind streaks that
follow your vertical speed, and a screen-space impact pass.

## Play

```sh
npm install
npm run dev
```

Open the printed URL, click to lock the pointer.

| Key | Action |
| --- | --- |
| WASD | Move |
| Mouse | Look |
| Shift | Sprint — required for big gaps and crumbling bridges |
| Space | Jump (hold for full height, tap for a hop) |
| Ctrl | Air dash — mid-air only, once per airtime |
| R | Restart the run |

Coral bridges collapse 0.55 s after you touch each segment — sprint across.
Periwinkle platforms sit beyond maximum jump range — dash to reach them.
Falling far below your last checkpoint respawns you there.

## Level guarantees

The course is generated once from a fixed seed, and every gap is provably
fair: a headless bot plays the real physics in Node and must clear all 66
stages (at both extremes of every moving platform) before a change ships.
Dash-only gaps are asserted to be *beyond* max sprint-jump range, and
crumbling bridges are verified crossable at sprint and fatal at a walk.
