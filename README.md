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

## Level guarantees

The course is generated once from a fixed seed, and every gap is provably
fair: a headless bot plays the real physics in Node and must clear all 66
stages (at both extremes of every moving platform) before a change ships.
Dash-only gaps are asserted to be *beyond* max sprint-jump range, and
crumbling bridges are verified crossable at sprint and fatal at a walk.
