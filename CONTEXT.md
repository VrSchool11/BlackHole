# Blackhole.io — Architecture & Context

Single-file HTML5 canvas game (vanilla JS, no build step). An agar.io-style game where you
are a black hole eating dust, asteroids, planets and rival holes, with real inverse-square
gravity. Works solo vs bots, and now real-time multiplayer with room codes.

## Files

- `index.html` — the client. CSS, HUD, death screen, WebAudio, mouse input, camera,
  renderer, and the `NetworkController` that mirrors the server. Loads `sim.js` first.
- `sim.js` — the shared, environment-agnostic simulation core (UMD: browser + Node).
  Everything authoritative: `CFG`, entities (`Entity`, `Dust`, `Asteroid`, `Planet`,
  `Player`, `Particle`), controllers (`HumanlikeController`, `RemoteIntentController`),
  `Game`, plus the shared snapshot `encode*`/`decode*` wire helpers.
- `server.js` — the authoritative server (Node + `ws`). One `Game` per room, 30Hz step,
  per-client diff snapshots, room create/join/respawn/disconnect handling, and a tiny
  static file server.
- `package.json` — the only dependency (`ws`).

## Architecture (unchanged seam)

```
Game        -> authoritative SIMULATION. Owns world, entities, step(dt). Never draws.
Renderer    -> READS Game, writes pixels. Never mutates simulation state.
Controller  -> anything producing an "intent" (a desired world point) for a Player.
Audio       -> synthesised WebAudio, event-driven off sim events. Client-only.
```

- **Solo** — the local `Game` is stepped in a fixed-timestep accumulator (now 60Hz).
- **Multiplayer** — the server's `Game` is stepped at 30Hz. Clients send only
  `{t:"intent", x, y}`; they never run physics. The client `NetworkController` maintains a
  mirror `Game`, interpolates between two snapshots, and writes positions into persistent
  `Entity` instances the existing `Renderer` already draws.

## Wire protocol (WebSocket at `/ws`)

Client -> server:
- `{t:"join", room:null|"CODE", name:"..."}` — create (null) or join a room.
- `{t:"intent", x, y}` — the only per-tick payload, throttled to ~30Hz.
- `{t:"respawn"}` — re-enter after death.

Server -> client:
- `{t:"joined", id, room, spawnTime}`
- `{t:"s", time, p:[...], f:[...], d:[...]}` — diff snapshot (players/food/deleted ids).
- `{t:"e", kind:"absorb"|"kill"|"death"|"spawn", ...}` — transient events for audio/particles/UI.
- `{t:"err", code:"invalid"|"full"}`.

Players encode as `[id,x,y,r,stretch,stretchAng,color,name,isBot,shield,eatFlash,diskAngle,pulse]`;
food encodes by type (`dust|asteroid|planet`). Values are rounded so the per-client diff
only ships what actually changed.

## Rooms

- Create generates a 5-char code (`K7QF2`-style) from an unambiguous alphabet (no I/O/0/1).
- Each room is an isolated `Game` with its own entities and bots (bots fill empty rooms;
  humans push the total toward the cap of 12).
- Invalid code -> `err invalid`. At cap -> `err full`. Disconnect -> hole removed, name freed.
- A room with zero members is destroyed to keep memory bounded.

## Bug fixes made

1. Merged the two duplicate `.stats { }` CSS rules into one.
2. `repopulate()` now builds a `Set` of current names and passes it to `spawnBot()`, so
   respawned bots can't duplicate a name (human or bot).
3. `killLocal()` now resolves a real rank via `rankOf()` even on a near-instant death.

## Performance fixes made

1. Added a uniform spatial bucket index (`buildSpatial`/`queryCircle`) used by both gravity
   and eating, so holes only test entities in cells their influence radius overlaps.
2. Capped `shadowBlur` at 40 and total particles at 300.
3. Dropped the solo sim from 120Hz to 60Hz (server is 30Hz; feel is unchanged).

## Run locally

```bash
npm install
npm start
# open http://localhost:8787 in two tabs
```

Tab A: name + **CREATE ROOM** -> note the code shown top-centre. Tab B: name + code +
**JOIN**. Both tabs send only their mouse intent; the server simulates and broadcasts.
