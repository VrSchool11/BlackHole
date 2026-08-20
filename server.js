/* ==========================================================================================
   BLACKHOLE.IO — AUTHORITATIVE MULTIPLAYER SERVER (Node + ws)
   ------------------------------------------------------------------------------------------
   One Game instance per room runs the exact simulation from sim.js. Clients send only a
   {t:"intent", x, y} point each tick (plus a name on join); the server steps the world at
   30Hz and broadcasts per-client DIFF snapshots (entity id, type, x, y, r, ...).

   Run:
     npm install
     npm start                 # -> http://localhost:8787  (serves index.html + sim.js too)

   Free tier: any Node host that can keep one long-lived process works (Render/Railway/Fly).
   Each room is just an object in memory, so a single small instance supports many rooms.
   ========================================================================================== */
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");
const SIM = require("./sim.js");

const { Game, Player, CFG, HUES } = SIM;

const PORT = process.env.PORT || 8787;
const TICK_MS = 1000 / 30;                     // 30Hz authoritative sim
const MAX_PLAYERS = 12;                        // room cap (humans + fill-in bots)
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // no I/O/0/1 to keep codes readable

const rooms = new Map();

function genCode() {
  let code;
  do {
    code = "";
    for (let i = 0; i < 5; i++) code += CODE_ALPHABET[(Math.random() * CODE_ALPHABET.length) | 0];
  } while (rooms.has(code));
  return code;
}

/** Keep names short, uppercase and free of characters that would break wire keys/HTML. */
function sanitizeName(raw) {
  return String(raw || "").replace(/[|<>]/g, "").trim().toUpperCase().slice(0, 12) || "PLAYER";
}

class Room {
  constructor(code) {
    this.code = code;
    this.game = new Game(null);                 // null audio: the sim is event-driven, audio is client-only
    this.game.init();                           // food + a set of bots to fill the empty room
    this.members = new Map();                   // ws -> { player, name, dead, last:{p:Map, f:Map} }
    this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  /** Returns "full" or { id, spawnTime }. Names are made unique inside the room. */
  addMember(ws, name) {
    if (this.game.players.length >= MAX_PLAYERS) return "full";

    const taken = new Set([...this.members.values()].map(m => m.name));
    let unique = name, n = 2;
    while (taken.has(unique)) unique = name + n++;

    const spot = this.game.safeSpawn(null);
    const player = new Player(spot.x, spot.y, unique, HUES[this.members.size % HUES.length]);
    player.controller = new SIM.RemoteIntentController(spot.x, spot.y);
    player.spawnTime = this.game.time;
    player.shield = CFG.PLAYER.SPAWN_SHIELD;
    this.game.players.push(player);
    this.members.set(ws, { player, name: unique, dead: false, last: { p: new Map(), f: new Map() } });
    this.game.events.push({ type: "spawn", hole: player });
    return { id: player.id, spawnTime: player.spawnTime };
  }

  /** Disconnect: remove the hole (compact() drops it next step) and free the name. */
  removeMember(ws) {
    const m = this.members.get(ws);
    if (!m) return;
    this.members.delete(ws);
    if (m.player) m.player.dead = true;
  }

  respawn(ws) {
    const m = this.members.get(ws);
    if (!m || !m.dead) return;
    const spot = this.game.safeSpawn(m.player);
    m.player.reset(spot.x, spot.y);             // id stays stable across deaths
    m.player.spawnTime = this.game.time;
    m.dead = false;
    if (!this.game.players.includes(m.player)) this.game.players.push(m.player);
    this.game.events.push({ type: "spawn", hole: m.player });
  }

  tick() {
    this.game.step(1 / 30);
    this.processEvents();
    this.broadcastSnapshots();
    if (this.members.size === 0) this.destroy();
  }

  /** Turn transient sim events into per-client wire events (absorb/kill/death/spawn). */
  processEvents() {
    const game = this.game;

    for (const ev of game.events) {
      if (ev.type === "absorb") {
        const isPlayer = ev.victim.type === "player";
        this.broadcast({
          t: "e", kind: "absorb",
          x: Math.round(ev.x), y: Math.round(ev.y), r: Math.round(ev.r),
          tint: ev.victim.color || ev.victim.tint, isPlayer,
          holeId: ev.hole.id, victimId: ev.victim.id
        });

        if (isPlayer) {
          for (const [ws, m] of this.members) {
            const mine = m.player === ev.hole;
            const victimIsMe = m.player === ev.victim;
            this.send(ws, { t: "e", kind: "kill", a: ev.hole.name, b: ev.victim.name, mine, victimIsMe });

            if (victimIsMe) {
              m.dead = true;
              const rank = game.rankOf(m.player);        // post-compact: counts survivors heavier than us
              m.player.bestRank = Math.min(m.player.bestRank, rank);
              this.send(ws, {
                t: "e", kind: "death",
                killer: ev.hole.name, killerId: ev.hole.id,
                rank: m.player.bestRank, peakMass: m.player.peakMass,
                time: game.time - m.player.spawnTime, absorbed: m.player.absorbed
              });
            }
          }
        }
      } else if (ev.type === "spawn") {
        for (const [ws, m] of this.members) {
          if (m.player === ev.hole) this.send(ws, { t: "e", kind: "spawn", spawnTime: ev.hole.spawnTime });
        }
      }
    }
    game.events.length = 0;
  }

  /** Per-client diff snapshot: only send an entity when its encoded tuple changed. */
  broadcastSnapshots() {
    const game = this.game;
    const time = game.time;

    for (const [ws, m] of this.members) {
      const p = [], f = [], d = [];
      const seenP = new Set(), seenF = new Set();

      for (const pl of game.players) {
        if (pl.dead) continue;
        seenP.add(pl.id);
        const enc = SIM.encodePlayer(pl);
        const key = enc.join("|");
        if (m.last.p.get(pl.id) !== key) { m.last.p.set(pl.id, key); p.push(enc); }
      }
      for (const id of m.last.p.keys()) if (!seenP.has(id)) { m.last.p.delete(id); d.push(id); }

      for (const fd of game.food) {
        if (fd.dead) continue;
        seenF.add(fd.id);
        const enc = SIM.encodeFood(fd);
        const key = enc.join("|");
        if (m.last.f.get(fd.id) !== key) { m.last.f.set(fd.id, key); f.push(enc); }
      }
      for (const id of m.last.f.keys()) if (!seenF.has(id)) { m.last.f.delete(id); d.push(id); }

      this.send(ws, { t: "s", time, p, f, d });
    }
  }

  broadcast(obj) { for (const ws of this.members.keys()) this.send(ws, obj); }

  send(ws, obj) { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); }

  destroy() {
    clearInterval(this.timer);
    rooms.delete(this.code);
    for (const ws of this.members.keys()) { try { ws.close(); } catch (e) {} }
    this.members.clear();
  }
}


/* ---------------- Static file server (index.html + sim.js) ---------------- */

const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".md": "text/plain" };
const STATIC = new Set(["index.html", "sim.js", "CONTEXT.md"]);   // whitelist: never serve server.js/package.json

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
  if (urlPath === "/" || urlPath.toLowerCase() === "/index.html") urlPath = "/index.html";
  const safe = path.normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  const file = path.join(__dirname, safe);
  if (file !== __dirname && !file.startsWith(__dirname + path.sep)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    res.end("forbidden");
    return;
  }
  if (!STATIC.has(path.basename(file))) {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { "Content-Type": "text/plain" }); res.end("not found"); return; }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", ws => {
  ws.room = null;
  ws.on("message", data => {
    let msg;
    try { msg = JSON.parse(data); } catch (e) { return; }
    handle(ws, msg);
  });
  ws.on("close", () => { if (ws.room) ws.room.removeMember(ws); });
});

function handle(ws, msg) {
  if (msg.t === "join") {
    const name = sanitizeName(msg.name);
    let room;
    if (msg.room) {
      room = rooms.get(String(msg.room).toUpperCase());
      if (!room) { ws.send(JSON.stringify({ t: "err", code: "invalid" })); ws.close(); return; }
    } else {
      room = new Room(genCode());
      rooms.set(room.code, room);
    }
    const out = room.addMember(ws, name);
    if (out === "full") { ws.send(JSON.stringify({ t: "err", code: "full" })); ws.close(); return; }
    ws.room = room;
    ws.send(JSON.stringify({ t: "joined", id: out.id, room: room.code, spawnTime: out.spawnTime }));
  } else if (msg.t === "intent") {
    const room = ws.room;
    if (!room) return;
    const m = room.members.get(ws);
    if (m && !m.dead && m.player.controller) {
      m.player.controller.x = Number(msg.x) || 0;
      m.player.controller.y = Number(msg.y) || 0;
    }
  } else if (msg.t === "respawn") {
    if (ws.room) ws.room.respawn(ws);
  }
}

server.listen(PORT, () => {
  console.log("Blackhole.io server  ->  http://localhost:" + PORT);
  console.log("Open two tabs at that URL, create a room in one, join with the code in the other.");
});
