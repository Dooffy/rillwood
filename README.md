<p align="center">
  <picture>
    <source srcset="app/assets/images/logo-mark-dark.svg" media="(prefers-color-scheme: dark)" />
    <img src="app/assets/images/logo-mark-light.svg" alt="" width="96" height="96" />
  </picture>
</p>

<h1 align="center">Rillwood</h1>

<p align="center">A fast, open-source Jellyfin client for iPhone, iPad and Android.</p>

<p align="center">
  <!-- Relative links: they resolve to this repository on GitHub, so a fork shows its own runs. -->
  <a href="../../actions/workflows/ci.yml"><img src="../../actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="../../actions/workflows/pages.yml"><img src="../../actions/workflows/pages.yml/badge.svg" alt="Website" /></a>
  <a href="https://stand-with-ukraine.pp.ua"><img src="https://raw.githubusercontent.com/vshymanskyy/StandWithUkraine/main/badges/StandWithUkraine.svg" alt="Stand With Ukraine" /></a>
  <br />
  <a href="LICENSE"><img src="https://img.shields.io/badge/licence-GPL--3.0--or--later-blue" alt="Licence: GPL-3.0-or-later" /></a>
  <img src="https://img.shields.io/badge/platforms-iOS%20%7C%20iPadOS%20%7C%20Android-lightgrey" alt="Platforms: iOS, iPadOS, Android" />
  <img src="https://img.shields.io/badge/Jellyfin-10.11%20%7C%2012.0%20%7C%2012.1-00a4dc" alt="Jellyfin 10.11, 12.0, 12.1" />
  <img src="https://img.shields.io/badge/Expo%20SDK-58-000020" alt="Expo SDK 58" />
  <img src="https://img.shields.io/badge/React%20Native-0.88-61dafb" alt="React Native 0.88" />
  <a href="CONTRIBUTING.md#sign-off-dco"><img src="https://img.shields.io/badge/DCO-sign--off-green" alt="DCO sign-off required" /></a>
</p>

---

Rillwood plays your library as it is, with no transcoding, and downloads it for when you're away from home. It connects only to your own Jellyfin server: no account, no analytics, no tracking.

<p align="center">
  <a href="https://apps.apple.com/app/id6824665406"><img src="https://img.shields.io/badge/App%20Store-Download-000000?logo=apple&logoColor=white" alt="Download on the App Store" /></a>
  <img src="https://img.shields.io/badge/Google%20Play-coming%20soon-lightgrey?logo=googleplay&logoColor=white" alt="Google Play: coming soon" />
</p>

**Status:** iPhone and iPad: [App Store](https://apps.apple.com/app/id6824665406). Android: coming soon to Google Play.

## Features

- **Direct play everything:** MKV and every common video, audio and subtitle format, played by libmpv.
- **Playback:** resume, audio and subtitle tracks, subtitle style and timing, video zoom, autoplay next episode, progress reported to the server.
- **Downloads:** movies, episodes or whole seasons, in the background. Pause and resume, and they survive the app being closed. Wi-Fi only or any network.
- **Offline:** browse and play downloads without a connection. Watch progress syncs when you're back online.
- **Auto-remove:** downloads delete themselves after 90 days, or sooner once watched if you choose.
- **Accounts:** several servers and users, switch in a tap, password or Quick Connect sign-in.
- **Browse:** Home (Up Next, Continue Watching, Next Up, Recently Added), one Library tab for browsing and search, movie and series detail.
- **iPad:** layouts for portrait, landscape, Split View and Stage Manager.
- Light and dark appearance.

Not planned for the first release: TV apps, PiP, AirPlay, Chromecast, SyncPlay, Live TV, music and books.

## Server

Jellyfin **12.1**, with 12.0 and 10.11 supported. Older servers below 10.10.7 get a warning.

## Build from source

The app is Expo SDK 58 and React Native 0.88 in `app/`. It uses a native player, so it needs a development build, not Expo Go.

```bash
cd app
npm ci
npx expo prebuild
npx expo run:ios --device    # or: npx expo run:android --device
```

You need Xcode for iOS, and Android Studio with the Android SDK for Android. For a local Jellyfin server with a generated test library, see [`dev/jellyfin/README.md`](dev/jellyfin/README.md).

Checks (lint, typecheck, format, unit tests): `npm run check` in `app/`.

## Repository

| Path                     | Contents                                                     |
| ------------------------ | ------------------------------------------------------------ |
| `app/`                   | The mobile app (iOS + Android)                               |
| `app/modules/`           | Native modules: the mpv player and the background downloader |
| `web/`                   | The project website (landing page, privacy policy)           |
| `dev/`                   | Local Jellyfin servers and test media                        |
| `docs/`                  | Roadmap, feature contracts, research, device test plans      |
| [`CLAUDE.md`](CLAUDE.md) | Project overview, locked decisions and conventions           |

## Availability & Support

Rillwood is an open-source project. Where and how it is offered is a decision made by the maintainers.

- **Regions & languages** - Supported countries, regions and languages are selected deliberately, and the list isn't open for discussion. Thanks for your understanding.
- **Translations** - Some translations may still be incomplete, and contributions are welcome. Feel free to fix, complete or improve the existing translation files and open a pull request - see [CONTRIBUTING](CONTRIBUTING.md) for details.
- **Communication** - Issues, discussions and support are handled in English only.
- **Support** - Support is provided on a best-effort basis, with no guaranteed response times.
- **Changes** - None of these decisions are final and may change over time.

The source code is available to everyone under the terms of the [LICENSE](LICENSE). Anyone using it is responsible for complying with the laws that apply to them.

## Contributing

Bug reports and pull requests are welcome. Commits need a DCO sign-off (`git commit -s`). Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before you start, and open an issue first for a new feature or dependency.

## Licence

[GPL-3.0-or-later](LICENSE), with an additional permission that allows distribution through app stores as long as the source stays public under the GPL. Third-party code and binaries: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md). The player libraries (mpv, FFmpeg) are currently GPL builds.

The Rillwood name and logo aren't covered by the code licence. Forks are welcome under a new name and icon: see [`TRADEMARKS.md`](TRADEMARKS.md).

Rillwood is an independent app for Jellyfin servers. It is not made by, affiliated with or endorsed by the Jellyfin project.
