# Deploying Blackhole.io to a website

**Multiplayer is peer-to-peer (WebRTC).** There is no server to deploy, no URL to
configure, no accounts. Each room is hosted by the browser of the player who clicks
CREATE ROOM; other players join it directly over WebRTC, using PeerJS's free public
signaling server (this is the one external dependency — the page needs internet).

That means ONE static host is enough: solo AND multiplayer both work on GitHub Pages,
Netlify, Cloudflare Pages, or itch.io.

## The easy way — upload ONE file

```bash
python3 bundle.py            # -> blackhole-standalone.html (~95 KB, zero npm deps)
```

Upload **`blackhole-standalone.html`** (rename it to `index.html` if you like) to any
static host. It contains the whole game including Create/Join multiplayer.

| Host | How |
| --- | --- |
| **GitHub Pages** | put the file in a repo → Settings → Pages → deploy from `main` |
| **Netlify Drop** | drag the file onto https://app.netlify.com/drop |
| **Cloudflare Pages** | Direct Upload → drag the file |
| **itch.io** | upload the file as an HTML project (or zip it first) |

Re-run `python3 bundle.py` whenever you edit `index.html` or `sim.js`.

## The two-file version (same result)

If you prefer to keep the source layout, upload **`index.html` + `sim.js`** into the same
folder on the same hosts. They MUST be together — `index.html` won't start without
`sim.js`.

## How to test

Open **two browser tabs** (or two devices) at the deployed URL:

1. Tab A: enter a name → **CREATE ROOM** → a code appears top-centre.
2. Tab B: enter a name + that code → **JOIN**.
3. Both holes move together in real time.

## Limits (honest)

- The room lives in the **creator's browser**. If the creator closes the tab, the room
  disappears. Best for small games with friends, not persistent world servers.
- Room cap is 12 players. The PeerJS free cloud can be slow or rate-limited under heavy
  concurrent use; if that ever matters, point `new Peer(...)` at a self-hosted PeerServer.

## `server.js` — optional, legacy

The repo still contains `server.js` (a Node + `ws` authoritative server) from the earlier
WebSocket design. It is **not needed** for deployment and the current `index.html` does
not use it. Keep it only if you want a dedicated always-on server later (persistent rooms,
anti-cheat, tournaments): deploy it to Render/Railway/Fly.io, `npm install && npm start`,
and re-point the client at it. For now: ignore it.
