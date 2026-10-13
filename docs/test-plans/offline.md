# Offline mode (manual device tests)

Offline detail + Downloads row: OF1-OF4 in [`downloads.md`](downloads.md).

`src/connection.ts` - rules in `docs/context/api.md` (Offline mode). Dev server: `dev/jellyfin` (`docker stop` / `docker start` the container to take the server away and back).

| #   | Test                                                                                | Expect                                                                                            |
| --- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| OM1 | Home open, `docker stop` the server, pull to refresh                                | Error + Retry (as before); then `docker start` - within ~30 s Home loads by itself, no tap needed |
| OM2 | Airplane mode, open the app (killed before), then airplane mode off                 | Home shows the error; within seconds of the network coming back it loads by itself                |
| OM3 | Library search showing an error (server stopped), server back                       | The list loads again by itself                                                                    |
| OM4 | Server stopped, app in the background for 2 min, server started, app back on screen | Loads at once on return (checked on foreground), no 30 s wait                                     |
| OM5 | Two accounts on two servers, one server stopped: switch to it, then back            | Switching to the stopped one shows errors; back to the running one loads normally                 |
| OM6 | Server stopped (network on), Downloads tab → tap a downloaded movie                 | Player opens at once (from the start) - no 8 s wait                                               |
