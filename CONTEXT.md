# notes on this project

Agar.io-ish game but you're a black hole. Real inverse-square gravity instead of the usual
"bigger eats smaller" rule, that's the whole hook. Single HTML file basically, no build step,
vanilla JS.

## what's where

- `index.html` — client. CSS/HUD/death screen/audio/camera/renderer, plus the P2P networking
  (`NetworkController`, `PeerHost`, `PeerSocket`). Loads `sim.js` first.
- `sim.js` — the actual simulation, shared between browser and node (UMD wrapper so server.js
  could use it too). `Game`, entities, the encode/decode helpers for the wire snapshots.
- `server.js` — old WebSocket server from before multiplayer moved to WebRTC. Not used by the
  current client anymore, kept around in case a real dedicated server is ever worth it again.
- `plinko.js` / `progression.js` — the death-screen bonus round and the token/quest/shop stuff.

Multiplayer is peer to peer now (PeerJS), no server needed — whoever clicks CREATE hosts the
room out of their own browser tab using the same `Game` class solo mode uses, and just
broadcasts snapshots to whoever joins. `NetworkController` on the joining side decodes those
into a mirror `Game` and the same renderer draws it. See DEPLOY.md for hosting.

Game / Renderer / Controller stay separate — Game never draws, Renderer never touches sim
state, Controller is just whatever's feeding a Player's mouse intent (human, bot AI, or
network). Kept that split since multiplayer needs the client to mirror positions without
running its own physics.

## random things worth knowing

- rooms use 5-char codes, no I/O/0/1 so they're not confusable
- bots fill empty slots up to 12 players, real people push bots out
- spatial hashing (`buildSpatial`/`queryCircle`) so gravity/eating don't check every entity
- solo runs the sim at 60Hz, used to be 120 before that felt unnecessary

## run it

```bash
npm install
npm start
# localhost:8787, two tabs to test multiplayer
```
