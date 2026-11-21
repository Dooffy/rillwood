# Kids mode - device test plan

Manual tests for kids mode (`docs/context/kids.md`), roadmap Kids mode tasks 3-10. Run on a physical iPhone (and an iPad for the T rows) against `dev/jellyfin` 12.1 + 10.11, after any change to kids mode, downloads or sign-in.

Record per run: date, commit, device + OS, pass / fail per row, notes.

Setup on the server: an adult user, a kids user with a parental rating limit (e.g. PG), a library of rated kids titles (G / TV-Y / TV-Y7 / PG), a few R / TV-14 titles, a few unrated home videos, and "Allow downloads" on for both users.

## Getting in

| #   | Test                                                                                       | Pass when                                                                                     |
| --- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| K1  | Add the kids user (password, then again with Quick Connect)                                 | "Who's it for?" appears, A kid picked; Continue → kids Home, 🐱 + Kids tag on its account row |
| K2  | Add the adult user                                                                           | No "Who's it for?" step, normal Home                                                          |
| K3  | Adult: Settings → 🦊 Kids Mode → 7+, unrated off, Library = one library → Start Kids Mode   | Kids Home with only that library's titles up to TV-Y7, no unrated videos                      |
| K4  | Kill and relaunch                                                                            | Opens straight into kids Home                                                                 |
| K5  | Account page → Kids account On for the adult (active)                                         | Kids mode starts at once                                                                      |

## Kids screens

| #   | Test                                                              | Pass when                                                                                   |
| --- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| K6  | Kids Home                                                          | Posters only, two across, shows on a card stack; a show opens its page, a movie plays       |
| K7  | Show page                                                          | Every episode as a big still, next one ▶ and in view; tap plays; big Back                   |
| K8  | 🔍 → type a word letter by letter (and dictate one)                | Keyboard up on open; every letter goes in; posters + episode stills; ✕ back, term forgotten |
| K9  | Search for something above the age                                 | Not found ("Nothing called that.")                                                          |
| K10 | Double-tap a poster fast                                           | One screen opens                                                                            |

## Grown-up gate and Settings

| #   | Test                                                                          | Pass when                                                                    |
| --- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| K11 | Tap the gear, answer wrong, then right                                         | Shake + new question; right: green check ~1.7 s, then the actions           |
| K12 | Gate → Settings (shared phone)                                                 | Only the Kids Mode card; age / unrated change kids Home on ‹ Kids Mode      |
| K13 | Card → Switch to Adult Mode                                                    | Normal Home; relaunch stays in the normal app                                |
| K14 | Kids account: gate → Settings, then Switch Account                             | Card without picks; Switch Account opens the accounts                        |

## Downloads (gate → Downloads)

| #   | Test                                                                               | Pass when                                                                                              |
| --- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| K15 | Open it; search a title                                                            | Storage bar, Shows / Movies, rows "0/N episodes" / a movie's size; search narrows as you type         |
| K16 | A show → Season 1                                                                   | That season downloads; row "Downloading x of y", then "n/N episodes · size"                           |
| K17 | Another show → Keep Next 5 Episodes                                                 | Asks first (text says a day after watching, Wi-Fi); 5 from where the kid is; row "Keeping 5 · …"      |
| K18 | Set Remove watched to 6 hours; watch a kept episode to the end; come back after 6 h | The watched one is gone, the next one downloads                                                        |
| K19 | Stop Keeping, then Delete Downloads                                                 | Stop: files stay, "Keeping" gone; Delete asks, then all gone                                           |
| K20 | Downloads turned off for the user on the server                                     | "Downloads Turned Off", no list                                                                        |

## Offline (task 10)

| #   | Test                                                                                     | Pass when                                                                                                 |
| --- | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| K21 | With downloads (shows + movies), turn on airplane mode, open the app                      | Straight into kids Home from downloads, the "✈︎ Offline · showing what's downloaded" bar, posters from the saved art, no Offline card |
| K22 | Open a downloaded show                                                                    | Only its downloaded episodes, the first not watched marked ▶; tap plays the file                         |
| K23 | Search offline                                                                            | Finds downloads only (an episode by its show's name too)                                                  |
| K24 | Shared phone 7+: the adult downloaded an R movie; go offline                              | The R movie isn't in kids Home or search                                                                  |
| K25 | Offline with nothing downloaded                                                           | 🌙 "Nothing to watch offline", nothing to press                                                           |
| K26 | Watch an episode offline, land (airplane mode off), come back to the app                  | Kids Home back to the full list, bar gone, the watch synced (next one moves on)                         |
| K27 | Weak Wi-Fi that doesn't answer                                                            | Loading placeholders until the check gives up, then the downloads - never a half-filled screen           |

## iPad (T)

| #   | Test                                  | Pass when                                                            |
| --- | ------------------------------------- | -------------------------------------------------------------------- |
| T1  | Kids Home, show page, search, rotated  | Posters ≥ 200 pt, stills ≥ 320 pt, grids reflow                      |
| T2  | Settings in landscape                  | Kids Mode / Library / Kids account open in the pane; from kids mode the pane starts empty |
