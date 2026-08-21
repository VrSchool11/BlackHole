# deploying this thing

Multiplayer's peer-to-peer over WebRTC (PeerJS), so there's nothing to actually deploy for
that part — no server, no accounts. Whoever clicks OPEN STATION hosts the room from their own
browser tab, everyone else connects straight to them through PeerJS's free signaling server
(that's the only thing that needs internet access). So really any static host works fine for
both solo and multiplayer.

## easiest way

```bash
python3 bundle.py
```

writes `blackhole-standalone.html`, one file with everything inlined. Just upload that
wherever — GitHub Pages, Netlify drop, Cloudflare Pages, itch.io as an HTML project, whatever.
Rename it to `index.html` if the host wants that. Re-run bundle.py after editing index.html or
sim.js, it doesn't pick up changes automatically.

Or skip bundling and just upload `index.html` + `sim.js` together — index.html loads sim.js so
they have to stay in the same folder.

## testing it

Two tabs (or two devices) pointed at wherever you deployed:
name + OPEN STATION in one, name + the station code + JOIN STATION in the other. Should see
both holes moving in real time.

## the catch

Room lives in the host's browser tab. They close it, room's gone — fine for playing with
friends, not something you'd want for a persistent server. Caps out at 12 players, and PeerJS's
free signaling can get slow if a ton of people hit it at once (self-host a PeerServer if that
ever actually matters).

## server.js

Leftover from before multiplayer was P2P. Not used, current client doesn't touch it. Only
worth resurrecting if you want an always-on authoritative server for real (persistent rooms,
anti-cheat, whatever) — deploy it like a normal node app and point the client at it. Otherwise
ignore.
