// Room server: ghost multiplayer relay, hosted on Cloudflare Workers as a
// Durable Object via partyserver. Holds only the latest state per connection
// and rebroadcasts one batched snapshot at 10 Hz, so client receive cost
// stays flat no matter how many players are climbing.
import { Server, routePartykitRequest } from 'partyserver';

const ADJ = [
  'SWIFT', 'BRAVE', 'GIGA', 'LUCKY', 'SUNNY', 'STORMY', 'MIGHTY', 'SNEAKY',
  'TURBO', 'COSMIC', 'SALTY', 'DIZZY', 'ROWDY', 'PLUCKY', 'ZIPPY', 'GRUMPY',
  'MELLOW', 'FEARLESS', 'BOUNCY', 'CRISPY', 'WOBBLY', 'SOARING', 'DARING', 'NIMBLE',
];
const ANIMAL = [
  'FALCON', 'OTTER', 'YAK', 'MARMOT', 'IBEX', 'CONDOR', 'GECKO', 'PUFFIN',
  'LYNX', 'HERON', 'BADGER', 'OSPREY', 'WOMBAT', 'SWIFT', 'STOAT', 'RAVEN',
  'PIKA', 'GANNET', 'SERVAL', 'KESTREL', 'MARTEN', 'PETREL', 'ALPACA', 'TAHR',
];

const TICK_MS = 100; // 10 Hz state broadcast
const GOLDEN_ANGLE = 137.508; // degrees; spreads hues so concurrent players never clash
const STALE_MS = 120_000; // evict half-open zombies; hidden tabs still send
// at worst once a minute under Chrome's intensive throttling, so they survive

export class GigaleapServer extends Server {
  nextSlot = 0;
  players = new Map(); // conn.id -> { slot, hue, name, last, s: [x,y,z,yaw,g,w] | null }
  timer = null;

  findConn(id) {
    for (const c of this.getConnections()) if (c.id === id) return c;
    return undefined;
  }

  onConnect(conn) {
    // partysocket reuses its connection id on reconnect — keep the same
    // identity so a wifi blip doesn't change your color or name
    const existing = this.players.get(conn.id);
    const slot = existing ? existing.slot : this.nextSlot++;
    const hue = (slot * GOLDEN_ANGLE) % 360;
    const name = `${ADJ[slot % ADJ.length]}-${ANIMAL[Math.floor(slot / ADJ.length) % ANIMAL.length]}`;
    // everyone else already here (with last-known state so avatars appear
    // in place immediately); never include the joiner's own id
    const roster = [...this.players]
      .filter(([id]) => id !== conn.id)
      .map(([id, p]) => ({ id, hue: p.hue, name: p.name, s: p.s }));
    this.players.set(conn.id, { slot, hue, name, last: Date.now(), s: existing?.s ?? null });
    conn.send(JSON.stringify({ t: 'welcome', id: conn.id, slot, hue, name, players: roster }));
    if (!existing) {
      this.broadcast(JSON.stringify({ t: 'join', id: conn.id, hue, name }), [conn.id]);
    }
    if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  onMessage(conn, msg) {
    let m;
    try {
      m = JSON.parse(msg);
    } catch {
      return;
    }
    if (m.t === 's' && Array.isArray(m.p) && m.p.length === 3) {
      const p = this.players.get(conn.id);
      if (p) {
        p.s = [+m.p[0], +m.p[1], +m.p[2], +m.y || 0, m.g ? 1 : 0, m.w ? 1 : 0];
        p.last = Date.now();
      }
    }
  }

  tick() {
    const now = Date.now();
    for (const [id, p] of this.players) {
      if (now - p.last > STALE_MS) this.drop(id);
    }
    const s = {};
    let any = false;
    for (const [id, p] of this.players) {
      if (p.s) {
        s[id] = p.s;
        any = true;
      }
    }
    if (any) this.broadcast(JSON.stringify({ t: 'states', n: this.players.size, s }));
  }

  drop(id) {
    if (!this.players.delete(id)) return;
    try {
      this.findConn(id)?.close();
    } catch {}
    this.broadcast(JSON.stringify({ t: 'leave', id }));
    if (this.players.size === 0 && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  onClose(conn) {
    // a reconnect replaces the connection under the same id — when the OLD
    // socket's close arrives late, the live replacement must not be dropped
    const live = this.findConn(conn.id);
    if (live && live !== conn) return;
    this.drop(conn.id);
  }

  onError(conn) {
    this.onClose(conn);
  }
}

export default {
  fetch(request, env) {
    return routePartykitRequest(request, env) ?? new Response('Not found', { status: 404 });
  },
};
