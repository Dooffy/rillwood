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

State per account: `src/kidsSettings.ts` (persisted key `settings.kids`, one entry per account id, survives relaunch; `removeAccount` drops it) - `{ account, shared, age, unrated, libraries? }`, default off / 7+ / unrated hidden / every library. `kidsMode`: `account` wins over `shared` (the server filters, no app filter on top); `kidsFilter` = the shared filter or none. The age is kept while kids mode is off (the last pick comes back). Read on boot to pick the first screen (`launchHref`, task 3).

## Screens

- **Home:** one screen, no tabs. Top bar: brand lockup (mark + "Rillwood" + "kids" tag) + the grown-ups' gear left, a round 🔍 right. Then every show and movie the kid can see, once each, as a 2:3 poster - two across on phones, no text (names only for VoiceOver), last watched first then A-Z (`kidsTitles`). No faces row, no feed of episodes, no hero, no Resume button. A show poster sits on a stack of two cards peeking out at its bottom right (there's more inside; the whole stack fills a movie poster's tile, the show's poster a little smaller) and opens its page; a movie (no stack) plays (resumes). Decided 2026-11-19 (draft 01b, option A): a feed of episodes showed a show's poster over and over (episodes have no poster, only a 16:9 still); characters are the menu for young kids.
- **Show:** the show's art + name, then every episode as a big 16:9 still (its own picture) with its name on it (white over the bottom fade, one line), ✓ icon when watched (no word), progress bar under the name when started, seasons flattened in order with a thin divider only when there are several, specials left out (`episodeRows`). The next one (the server's Next Up for the show) carries a ▶ chip (no ring) and is scrolled into view on open. Tap = play. Big round Back (52 pt) always on top.
- **Search** (`/kids-search`, `KidsSearch`, data `useKidsSearch`; draft 02 option A, decided 2026-11-21): 🔍 on Home opens it; the big field takes focus once the screen is in (`transitionEnd` - focused while it animates, iOS took one key and stopped), keyboard up (the keyboard's mic = dictation). Results 300 ms after the last key, no Search key: by name (`kidsSearch`: server `searchTerm`, shows + movies in one request, episodes in another, same filter as Home; a shared phone's episodes also only from allowed shows). Shows and movies as Home's posters (a show opens its page, a movie plays), then episodes as big stills (tap plays). Nothing before typing (Home shows everything). "Nothing called that." when empty, Retry on errors, the Offline card when the server is out of reach (downloads search: task 10). ✕ (56 pt) back to Home; the term is forgotten.
- **Player:** the app's player, unchanged. Closing it returns to kids mode.
- Tablet: Home posters at least 200 pt wide (11": 3 across upright, 5 landscape; 13": 4 upright, 6 landscape); show page stills at least 320 pt (2-3 across). Phones: Home two across, show page one column.
- No detail pages, menus, filters, sort, long-press, download buttons.
- Fast double taps open one screen (`once`, 800 ms, `src/components/kids/KidsCards.tsx`).

Built (tasks 3, 5, 6): `app/kids.tsx` → `KidsHome`, `app/kids-show/[id].tsx` → `KidsShow`, `app/kids-search.tsx` → `KidsSearch` (`src/screens/kids/`), data `useKidsHome` / `useKidsShow`, cards `src/components/kids/`, sizes `kids` in `src/theme.ts`. Start screen per account: `homeHref` (`src/navigation.ts`) - launch, sign-in, account switch and the account removal hand-over land on `/kids` while kids mode is on; Apple TV never. Until later tasks: no "Who's it for?" step after sign-in (task 8); the libraries pick isn't applied yet (task 8); no new-episode dot on show posters yet; offline shows the Offline card (downloads, task 10).

## Grown-up gate

- A small gear right after the brand lockup (`KidsHome`; the lockup itself is a plain logo). One tap opens the sheet - no hold, no hint; a kid can tap it too, the sum is the gate.
- The sheet (`KidsGate`, on `ActionSheet`): "Grown-ups only", a multiplication in words (both numbers 6-9, so two digits - `src/kidsGate.ts`), two answer boxes and a round keypad (Delete takes a digit back). Two digits typed → checked: wrong shakes and asks a new question (never the same one); right turns the boxes green and pops a checkmark in over the keypad (`SOLVED_MS`, 1.7 s), then the actions take its place. Cancel closes; the next opening asks again. Nothing to remember (no PIN).
- Behind it: **Settings** (the app's own, pushed over kids Home - back returns), then **Switch Account** on a kids account (it always opens in kids mode, so switching is the way out) or **Leave Kids Mode** on a shared phone (shared off, the normal Home). **Downloads** joins with task 9.

## Entry points

- Settings: a 🦊 **Kids Mode** row under the accounts ("Hand your phone to a kid", the age as its value) → the Kids Mode screen (`/kids-mode`) with the **Kids Mode card** (`KidsModeCard`): Age pills (3+ / 7+ / 10+ / 13+), a Show unrated videos toggle (off) - a tap saves - then **Start Kids Mode** (shared on, stack cleared to kids Home). Libraries join with task 8. Kids accounts carry a 🐱 avatar and a **Kids** tag on their account row; tapping it = entering kids mode. Picking the animals: later.
- Account page: **Kids account** row → On / Off list (`/kids-account`, `KidsAccountSettings`). On for the active account starts kids mode at once.
- Settings opened from kids mode (gate → Settings, `PhoneSettings`): the card first - shared phone: "Kids Mode is on", the same picks (apply at once), **Switch to Adult Mode** (shared off, normal Home - the gate's Leave Kids Mode without the sum again); kids account: "<name> is a kids account", no picks (the server filters), **Switch Account**. One action on the card: back to kids mode is the header's back button. Nothing else there: Playback, Downloads and Display are device-wide (changing them would change the grown-ups' too), so they wait in the full app; kids downloads come with task 9. Back says "‹ Kids Mode" (the kids screen's title). Tablet landscape: the pane starts empty, never the account page.
- Phones and tablets only: no Kids rows on Apple TV.

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
