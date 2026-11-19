# Kids mode

Read before working on kids mode. Status: **draft, not built** (roadmap: Kids mode). Screens: [`docs/research/kids-screens.html`](../research/kids-screens.html). Server behaviour tested on 12.1 + 10.11: [`docs/research/jellyfin-api.md`](../research/jellyfin-api.md) §6b.

Phones and tablets only. Apple TV: later, own draft.

## Two kinds, one look

| | Kids account | Shared phone |
|---|---|---|
| What | A Jellyfin user with a rating limit | Kids mode on an adult's own account |
| Turned on | Detected at sign-in (`/Users/Me` → `Policy.MaxParentalRating` set) → "Who's it for?" step, "A kid" pre-picked. Or by hand: Account page → Kids account: On | Settings → Kids Mode → age, libraries, unrated → Start |
| Turned off | Account page → Kids account: Off (normal app, the server limit stays). Lifting the limit = server admin | Gate → Leave Kids Mode |
| Who filters | The server - everything, incl. Resume, Next Up, Latest, search; blocked items 404 | The app (below) - hides, doesn't block: anyone through the gate sees everything |
| Opens in kids mode | Whenever it's the active account | Until a grown-up leaves (survives kill / relaunch) |

Detection: `isKidsAccount` (`src/kids.ts`) - any `MaxParentalRating` number, 0 included.

Not detected: a kids user limited by libraries only (adults have limited libraries too) - marked by hand.

Storage, per account, `src/settings.ts`: `kids: off | account | { age, libraries, unrated }`. Read on boot to pick the first screen (`launchHref`).

## Screens

- **Home:** one screen, no tabs. Top bar: brand lockup (mark + "Rillwood" + "kids" tag) left, search right. Show faces (round posters) on top, then one feed of big 16:9 pictures: Continue, Next Up, newest - each item once, only items with a file. No hero, no big Resume button. Tap a picture = play (resume); tap a face = the show.
- **Show:** episodes in one list, seasons as thin dividers, the next one marked and scrolled to. Tap = play.
- **Search:** quick search by name, big results, same filter.
- **Player:** the app's player, unchanged. Closing it returns to kids mode.
- Tablet: faces row + a 3-across grid.
- No detail pages, menus, filters, sort, long-press, download buttons.

## Grown-up gate

- Hold the brand mark 2 s - a ring fills around it. A tap does nothing; the "Grown-ups: keep holding" hint shows on press and stays 3 s after letting go, then fades.
- Then a sheet with a math question (a × b, 6-9, in words), typed on a keypad. Wrong → shake + a new question. Nothing to remember (no PIN).
- Behind it: **Downloads**, **Settings**, **Switch Account** (kids account) / **Leave Kids Mode** (shared phone).
- First time in: a coach mark shows the grown-up the way out.

## Entry points

- Settings: a **Kids Mode** row under the accounts (current age as its value), hidden on a kids account. Kids accounts carry a **Kids** tag on their account row; tapping it = entering kids mode.
- Account page: **Kids account: On / Off** (checkmark list, like every setting).
- Settings opened from kids mode: same page, back says "‹ Kids Mode".

## Shared filter

Age steps map to the server's rating score (`/Localization/ParentalRatings`: `{Name, Value}`, all countries; the server compares by score, so `PG` = `TV-PG`):

| Step | `maxOfficialRating` | Score | Lets in (US) |
|---|---|---|---|
| 3+ | `TV-G` | 0 | G, TV-Y, TV-G |
| 7+ | `TV-Y7` | 7 | + TV-Y7 |
| 10+ | `PG` | 10 | + PG, TV-PG |
| 13+ | `PG-13` | 13 | + PG-13. TV-14 (14) stays hidden (decided 2026-11-19) |

Unrated videos: **hidden by default** (decided 2026-11-19) - home videos and odd files have no rating.

Server rules (both versions):
- `maxOfficialRating` works on `/Items` (lists, search, episodes - an episode has no rating, it takes its series') and `/Shows/{id}/Episodes`. It **keeps unrated** items.
- `hasParentalRating=true` drops unrated movies / series; **broken on episodes** (every episode counts as rated).
- `/UserItems/Resume`, `/Shows/NextUp`, `/Items/Latest` **ignore** `maxOfficialRating`.

So (`src/kids.ts`: `ratingQuery`, `allowedShows`, `keepAllowed`):
- **Allowed shows** = `/Items?includeItemTypes=Series&recursive=true&maxOfficialRating=X` (+ `hasParentalRating=true` when unrated is hidden). This is the faces row too.
- Movies: `maxOfficialRating` (+ `hasParentalRating=true`).
- Episodes: kept only when `SeriesId` is in the allowed shows (pure app check) - covers unrated and Next Up.

| Where | Request |
|---|---|
| Faces | Allowed shows |
| Feed: Continue | `/Items?filters=IsResumable&sortBy=DatePlayed&includeItemTypes=Movie,Episode` + limit, episodes checked |
| Feed: Next Up | `/Shows/NextUp`, episodes checked |
| Feed: newest | `/Items?sortBy=DateCreated&includeItemTypes=Movie,Episode` + limit, episodes checked |
| Search | `/Items?searchTerm=` + limit, episodes checked |
| Show | Opened from an allowed face; `/Shows/{id}/Episodes` + limit as a backstop |
| Downloads (Add for the trip) | The same lists |

Kids account: no app filter. A blocked show's episodes come back 404 on 12.1, `200` empty on 10.11.

## Downloads

- Grown-ups only: gate → Downloads. Kids never see a download button. Needs "Allow downloads" on the server.
- The standard Downloads view: **On This Phone** (the usual rows) + **Add for the trip** (the filtered shows and movies, ↓ each). A show keeps its next 5 episodes and tops up as they're watched. Done → back to kids mode.
- Downloads stay per account. On a shared phone the adult's own downloads show in kids mode only if they pass the filter; in the normal app all show.
- Offline filter: a download saves its **rating score** (an episode: its series' score) when it's made. Downloads without one count as unrated (decided 2026-11-19).

## Offline

- The feed and faces come from the account's downloads, same filter. Kids can't tell anything is missing; a small "Downloaded" chip is for grown-ups.

## Open

- Look: the app's dark palette vs a softer kids palette.
- Feed order: newest vs shuffled per day.
- Keep count per show (5) fixed or a setting.
- Ratings outside the US (FSK, BBFC) not tested - the server compares by score, so they should line up.
