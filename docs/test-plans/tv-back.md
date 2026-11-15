# Apple TV Back (`modules/tv-back`)

Manual plan for the native Back catcher (`TvBackView`). Run on the Apple TV simulator (Esc = Back) and on a device with the Siri Remote (Back / Menu button). Unit tests cover the JS side (`src/components/tv/focus.test.tsx`: holders, per-screen scope); this covers the native press.

| #   | Where                                                   | Do                                  | Expected                                                                         |
| --- | ------------------------------------------------------- | ----------------------------------- | -------------------------------------------------------------------------------- |
| 1   | Player, episode with a next one                         | Last 30 s: Up Next card → Back      | Card hides, video keeps playing, no flash of the screen under it; the end pauses |
| 2   | Player                                                  | Controls up → Back                  | Controls hide, video plays on                                                    |
| 3   | Player                                                  | Controls down → Back                | Player closes (to the detail page)                                               |
| 4   | Player                                                  | CC / Audio / Speed menu open → Back | Only the menu closes, focus back on its button                                   |
| 5   | Movie page                                              | Details → Media card → panel → Back | Only the panel closes                                                            |
| 6   | Movie page                                              | Scrolled below the hero → Back      | Back up to Play; Back again leaves the page                                      |
| 7   | Movie page scrolled down → Play → player, controls down | Back                                | Player closes (the page under it doesn't keep it open)                           |
| 8   | Library (tab)                                           | Sort / Filter panel → Back          | Panel closes (tab screens: `BackHandler`)                                        |
| 9   | Home (tab root)                                         | Back                                | tvOS home screen (the app doesn't take Back at the root)                         |
