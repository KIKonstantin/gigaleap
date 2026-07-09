// Ghost-multiplayer net client. Connects every visitor to the single global
// PartyKit room, sends our state at ~12 Hz and dispatches server messages to
// the callbacks. The whole module is optional: with no host configured (prod
// build without VITE_PARTYKIT_HOST) it returns a disabled stub and the game
// is plain single-player.
import PartySocket from 'partysocket';

const SEND_MS = 83; // ~12 Hz; a setInterval (not the game loop) so players
// idling on the start overlay — or in a hidden tab — keep reporting in

// The deployed room server (public anyway — it ships in the bundle).
// VITE_PARTYKIT_HOST overrides it; dev builds use the local wrangler dev.
const PROD_HOST = 'gigaleap.kikonstantin.workers.dev';

const r2 = (v) => Math.round(v * 100) / 100;

export function createNetClient({ getState, onRoster, onJoin, onLeave, onStates, onCount, onStatus }) {
  const host = import.meta.env.VITE_PARTYKIT_HOST
    || (import.meta.env.DEV ? 'localhost:1999' : PROD_HOST);
  if (!host) {
    return {
      enabled: false,
      id: () => null,
      name: () => null,
      hue: () => null,
      connected: () => false,
      players: () => new Map(),
    };
  }

  let selfId = null;
  let selfName = null;
  let selfHue = null;
  let up = false;
  const roster = new Map(); // id -> { hue, name } (remote players only)

  // wss:// is picked automatically on https pages; PartyKit accepts
  // cross-origin upgrades, so the Vercel-hosted client needs no CORS setup
  const socket = new PartySocket({ host, room: 'global' });

  socket.addEventListener('open', () => {
    up = true;
    onStatus?.(true);
  });

  socket.addEventListener('close', () => {
    if (!up) return;
    up = false;
    roster.clear();
    onStatus?.(false); // partysocket keeps retrying in the background
  });

  socket.addEventListener('message', (e) => {
    let m;
    try {
      m = JSON.parse(e.data);
    } catch {
      return;
    }
    if (m.t === 'welcome') {
      selfId = m.id;
      selfName = m.name;
      selfHue = m.hue;
      roster.clear();
      // never mirror ourselves as a remote, whatever the server sends
      const others = m.players.filter((p) => p.id !== selfId);
      for (const p of others) roster.set(p.id, { hue: p.hue, name: p.name });
      onRoster?.(others);
      onCount?.(roster.size + 1);
    } else if (m.t === 'join') {
      if (m.id === selfId) return;
      roster.set(m.id, { hue: m.hue, name: m.name });
      onJoin?.(m);
      onCount?.(roster.size + 1);
    } else if (m.t === 'leave') {
      roster.delete(m.id);
      onLeave?.(m.id);
      onCount?.(roster.size + 1);
    } else if (m.t === 'states') {
      onStates?.(m.s, m.n, performance.now());
      onCount?.(m.n); // authoritative count, self-heals any roster drift
    }
  });

  setInterval(() => {
    if (socket.readyState !== 1) return; // OPEN
    const s = getState();
    socket.send(JSON.stringify({
      t: 's',
      p: [r2(s.x), r2(s.y), r2(s.z)],
      y: r2(s.yaw),
      g: s.grounded ? 1 : 0,
      w: s.won ? 1 : 0,
    }));
  }, SEND_MS);

  return {
    enabled: true,
    id: () => selfId,
    name: () => selfName,
    hue: () => selfHue,
    connected: () => up,
    players: () => roster,
    socket,
  };
}
