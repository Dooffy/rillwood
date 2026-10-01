# Local Jellyfin for development

Pinned Jellyfin servers in Docker plus a generated test library, so every contributor tests against the same thing.

| Server | Port | Start |
|---|---|---|
| **12.1** (base) | `8096` | `docker compose up -d` |
| 10.11 (compat) | `8097` | `docker compose --profile compat up -d` |

## First run

```bash
cd dev/jellyfin
./make-test-media.sh             # ~1-2 min, ~300 MB into ~/rillwood-media (needs ffmpeg)
docker compose up -d
node setup.mjs                   # wizard, users, libraries; safe to re-run
node setup.mjs --server http://localhost:8097   # compat server, if started
```

Open http://localhost:8096 to check. **Dev-only** logins: `admin` / `admin-rillwood`, `test` / `test-rillwood`. Never reuse them on a real server.

## Media

Set `RILLWOOD_MEDIA` to use another folder (default `~/rillwood-media`). It's mounted read-only at `/media` and never committed.

| Folder | Library | Contents |
|---|---|---|
| `movies/` | Movies | Generated: H.264 / HEVC 10-bit / HDR10 / AV1 / 4K HEVC; AAC, AC3, E-AC3, DTS, TrueHD; SRT + ASS; multi-audio + multi-subs; Japanese, Chinese, Korean, Arabic, Hebrew subs |
| `shows/` | Shows | Generated: `Test Show` S01E01-03, 2 min each (resume, Next Up, autoplay next) |
| `real/` | Real | **Add by hand** - can't be generated: Dolby Vision Profile 8 clip, a Blu-ray rip with **PGS** subtitles, a large 4K remux |

## Phone access

By default the servers listen on **localhost only** (simulator and browser work). The dev logins are public (in this README), so only open them to the LAN on a **trusted** network (home, not cafe/coworking):

```bash
RILLWOOD_BIND=0.0.0.0 docker compose up -d   # LAN access while you test on the phone
ipconfig getifaddr en0                       # e.g. 192.168.1.20 -> http://192.168.1.20:8096
docker compose up -d                         # back to localhost-only afterwards
```

iOS asks for **Local Network** permission the first time the app connects - allow it.

## Reset / stop

```bash
docker compose down              # stop (state kept in data/)
rm -rf data && mkdir -p data/12/config data/12/cache && docker compose up -d && node setup.mjs   # fresh server
```

Version bumps: change the pinned image tags in `compose.yml` and note it in `CLAUDE.md` §2.
