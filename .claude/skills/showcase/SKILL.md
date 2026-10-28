---
name: showcase
description: Showcase library on the local dev Jellyfin (fictional movies + shows, user demo) for store screenshots and demos - reset demo's watch state, or switch the download titles to realistic large file sizes and back. Use when the user wants screenshots, the demo account, demo downloads, big / realistic download sizes, or to reset or clean up the showcase.
---

Showcase library helper. Usage: `/showcase [reset | large | small]`. No argument → `reset`. Setup and contents: `dev/jellyfin/README.md` "Showcase library", rules: `docs/context/dev-server.md`. All commands run from `dev/jellyfin/`.

> **NEVER add Claude as co-author or any AI attribution** - applies to anything this skill writes.

| Mode | Does |
|---|---|
| `reset` | demo's watch state back to `showcase/showcase.json` `demo` (Continue Watching, Next Up, watched, favourites) |
| `large` | titles with `downloadGB` in `showcase.json` padded to that size (download screenshots: real-looking rows + storage bar) |
| `small` | padding removed - back to the normal ~20 MB files (default state) |

Never drive the simulator or a device (no `simctl` boot / launch / screenshot, no deep links) - give the user the in-app steps instead.

---

## Step 1 - Preconditions

```bash
docker ps --format '{{.Names}}' | grep -q rillwood-jellyfin-12 || echo "server not running"
ls "${RILLWOOD_MEDIA:-$HOME/rillwood-media}/showcase" >/dev/null 2>&1 || echo "no showcase media"
```

- Server not running → `docker compose up -d`, then `node setup.mjs` (it runs `showcase.mjs`).
- No showcase media → `./make-test-media.sh` (or `node make-showcase-media.mjs`), then `node setup.mjs`. Takes ~10 min - tell the user and run it in the background.

---

## Step 2 - Run the mode

**reset**

```bash
node showcase.mjs
```

**large** - check the space first. The padding is sparse on the Mac (no real disk used), but every downloaded byte is real on the simulator / phone:

```bash
node -e "const j=require('./showcase/showcase.json');let b=0;for(const m of j.movies)b+=m.downloadGB??0;for(const s of j.shows)b+=(s.downloadGB??0)*s.episodes.length;console.log(b.toFixed(1)+' GB')"
df -h ~ | tail -1
```

Less free space than the total + 10 GB → stop and tell the user (they can drop titles' `downloadGB` in `showcase.json`). Otherwise:

```bash
node make-showcase-media.mjs --large-files
node showcase.mjs       # rescan so the server reports the new sizes; also resets demo's state
```

**small**

```bash
node make-showcase-media.mjs --small-files
node showcase.mjs
```

---

## Step 3 - Tell the user

- **reset**: demo's Home is back - Glass Orbit hero, Continue Watching, Next Up.
- **large**: list the padded titles (`downloadGB` entries) with sizes, then the steps: sign in as `demo` / `demo-rillwood` (`http://localhost:8096` on the simulator; a phone needs `RILLWOOD_BIND=0.0.0.0 docker compose up -d` on a trusted network, README "Phone access"), download each from its detail screen (movies) or season menu (shows); Settings → Downloads → Any network if a phone isn't on Wi-Fi. A downloading ring for a screenshot: throttle with Network Link Conditioner. Afterwards: delete the downloads in the app to free the device space, then `/showcase small`.
- **small**: files back to normal. Downloads already made in the app keep their large size until deleted there.
