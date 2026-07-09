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

Open the printed URL and hit PLAY (the home menu also has a quality
selector and the controls reference).

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

## Multiplayer

Everyone on the site shares one world: other climbers appear as colored
low-poly ghosts (no collision) with a name floating overhead, and the HUD
shows the live player count. Each player gets a unique server-assigned
color and an auto-generated name.

The game itself stays a static build; a small
[partyserver](https://github.com/cloudflare/partyserver) room server on
Cloudflare Workers relays positions (clients send ~12 Hz, the server
rebroadcasts one batched snapshot at 10 Hz). Without a reachable server the
game runs fully single-player.

```sh
npm run party   # local room server (wrangler dev) on localhost:1999
npm run dev     # in a second terminal — connects to it automatically
```

Deploy (once): `npx wrangler login` (free Cloudflare account), then
`npm run party:deploy` — it prints the worker URL, e.g.
`https://gigaleap.<subdomain>.workers.dev`. Set `VITE_PARTYKIT_HOST` to
that host (no protocol) in Vercel's environment variables and redeploy —
Vite inlines it at build time.

## Quality tiers

The renderer scales to the hardware — the same build runs on a gaming rig
and a Raspberry Pi-class embedded display. Three tiers (`src/core/quality.js`):

- **high** — today's full look: 2048² shadows, 4× MSAA half-float post
  chain, all 20 scenery clouds, 2× pixel ratio.
- **med** — 1024² shadows, 2× MSAA on an 8-bit target, trimmed clouds/rain.
- **low** — 0.75× render scale, no shadow pass (a blob disc under the player
  keeps the landing-aim signal), no post chain (the eaten-blackout and
  cloud-whiteout become DOM veils), Lambert materials, sea on a coarser
  grid, scenery clouds baked into one static mesh.

The tier is picked at boot from `?quality=low|med|high` (wins always), a
saved choice in localStorage (the home-menu QUALITY selector, or the
governor after a downgrade), or a GPU/UA heuristic. A frame governor
watches the rolling frame time while playing and steps the tier down if the
device can't hold 30 fps, persisting the choice for the next load.

All platforms render as a single `InstancedMesh`; physics colliders are
unchanged, but `platform.mesh` / `platform.material` (e.g. via
`window.__ascent.platforms`) are now plain view records
(`{position, rotation, scale, visible}` / `{emissiveIntensity}`) flushed
into the instance buffers once per frame — not `THREE.Mesh` objects.
Gameplay physics is identical on every tier: no tier option ever reaches
the node-testable physics modules.

## Level guarantees

The course is generated once from a fixed seed, and every gap is provably
fair: a headless bot plays the real physics in Node and must clear all 66
stages (at both extremes of every moving platform) before a change ships.
Dash-only gaps are asserted to be *beyond* max sprint-jump range, and
crumbling bridges are verified crossable at sprint and fatal at a walk.
