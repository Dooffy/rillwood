# Dev Jellyfin servers + test media

Read before working on `dev/jellyfin/`. Setup and usage: [`dev/jellyfin/README.md`](../../dev/jellyfin/README.md).

- Pinned servers: 12.1 (base, `:8096`) and 10.11 (compat, `:8097`, `--profile compat`). Localhost only by default; LAN only on a trusted network (`RILLWOOD_BIND=0.0.0.0`).
- Dev-only users `admin` / `admin-rillwood`, `test` / `test-rillwood` - never reuse on a real server.
- Media lives in `$RILLWOOD_MEDIA` (default `~/rillwood-media`), never committed. `make-test-media.sh` generates the synthetic matrix (incl. the 7-min `Resume Test` - server resume rules need ≥ 5 min).
- `real/` is not generated: recipes in [`docs/research/real-test-media.md`](../research/real-test-media.md), helpers in `real-media/` (`Sintel (2010)` 4K CC-BY for B6, a DV P8.1 + TrueHD + PGS clip for C4). Only freely licensed or self-generated media.
- Keep the media table in `README.md` and the rows in `docs/test-plans/mpv.md` in sync with what the script produces.
- Test scripts against the servers: add `mediaTypes=Video` to Resume, never put tokens in URLs or logs, clean up devices / watch state you create (`UserData` can't clear `LastPlayedDate` - `DELETE /UserPlayedItems/{id}` does).
- `npm run check:home [-- --server http://localhost:8097]` (from `app/`): checks the Home + detail data layer against a server as `test` - rows, 10.11 Latest shaping, time left, detail facts / tracks / cast, series seasons / episodes / Play target, Similar, library paging / sorts / unwatched, search grouping, mark watched / favourite (answers match `changedUserData`, a season marks its episodes), image cache headers, playback sources (every movie + an episode direct play with the app's profile, stream Range 206, sidecar SRT served, no token in URLs), playback reporting (a session stopped at 2:00 on a movie >= 6 min leaves a resume point, one stopped at 95% marks it watched); restores the watch state it sets.
