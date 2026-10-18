# Store requirements - App Store + Google Play (M7 research)

Date: 2026-10-02. Tags: **[V]** verified against a primary source or the local build, **[U]** unverified / judgement.

## TL;DR - things that will break or bite first

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Fix                                                                                                                                        | Tag                                                                  |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------- |
| 1   | **Android release builds block `http://` servers.** `usesCleartextTraffic="true"` is only in `android/app/src/debug` + `debugOptimized` manifests; release with targetSdk 36 defaults to cleartext off. Most LAN Jellyfin servers are plain http                                                                                                                                                                                                                                                                                                                                 | `expo-build-properties` -> `android.usesCleartextTraffic: true` (network security config can't scope to private IP ranges, so it's global) | [V] local build files                                                |
| 2   | **iOS release strips the local network purpose string.** `expo-dev-launcher` adds a build phase that deletes `NSLocalNetworkUsageDescription` in release when the text is its own "Expo Dev Launcher ..." default. LAN servers then prompt with no app text                                                                                                                                                                                                                                                                                                                      | Set our own `ios.infoPlist.NSLocalNetworkUsageDescription` (kept in release because it doesn't match the dev text)                         | [V] `node_modules/expo-dev-launcher/plugin/build/withDevLauncher.js` |
| 3   | **ATS: plain-http remote servers (non-IP, non-`.local`) fail on iOS.** Current plist: `NSAllowsLocalNetworking: true`, `NSAllowsArbitraryLoads: false`. Local networking covers IPs, `.local`, unqualified names only. If we switch to `NSAllowsArbitraryLoads: true` we **must remove `NSAllowsLocalNetworking`** - Apple: ArbitraryLoads is ignored if it's present. Arbitrary loads needs a justification at review                                                                                                                                                           | Decide (see §A4). Note: mpv/FFmpeg traffic doesn't go through URLSession, so ATS only affects `fetch` + background downloads               | [V] Apple ATS docs                                                   |
| 4   | **Privacy manifest misses `DiskSpace`.** Generated `ios/Rillwood/PrivacyInfo.xcprivacy` has UserDefaults CA92.1, FileTimestamp C617.1, SystemBootTime 35F9.1 only. RN's aggregation reads CocoaPods resource bundles; with `EXPO_USE_PRECOMPILED_MODULES` the ExpoFileSystem manifest (DiskSpace E174.1 + 85F4.1) sits inside a nested bundle of a dynamic framework and isn't aggregated. MPVKit is a **static archive with no manifest** that imports `stat`/`fstat`/`lstat`/`fstatat` (FileTimestamp), `statvfs`/`fstatfs` (DiskSpace), `mach_absolute_time` (SystemBootTime) | Declare all in `ios.privacyManifests` (§A2). Missing reasons -> App Store Connect rejects the upload (ITMS-91053, since 2024-05-01)        | [V] local files + `nm`, Apple docs                                   |
| 5   | **`demo.jellyfin.org` can't be the review server for downloads.** Alive (stable = 12.1.0, unstable = 13.0.0, user `demo`, empty password), but the demo user has `EnableContentDownloading: false` and the server resets hourly                                                                                                                                                                                                                                                                                                                                                  | Self-host a small review server (§C9)                                                                                                      | [V] probed 2026-10-02                                                |
| 6   | **Export compliance: MPVKit bundles OpenSSL + GnuTLS** (FFmpeg TLS for `https` streams) - "standard encryption not provided by Apple OS" -> French encryption declaration if distributed in France                                                                                                                                                                                                                                                                                                                                                                               | §A3                                                                                                                                        | [V] `nm` on MPVKit, Apple ASC help                                   |
| 7   | **Personal Play account: 12 testers x 14 consecutive days closed test** before production (accounts created after 2023-11-13)                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Plan 3+ weeks of closed testing in M7                                                                                                      | [V] Play help 14151465                                               |
| 8   | Android manifest carries `SYSTEM_ALERT_WINDOW`, legacy `READ/WRITE_EXTERNAL_STORAGE` from the template                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `android.blockedPermissions` for all three (we only write app-private storage)                                                             | [V] manifest, [U] need                                               |

---

## A. Apple

### A1. App Review Guidelines that apply

| Guideline                             | Text (short quote)                                                                                                                                                 | Rillwood impact                                                                                                                                                                                                                                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.1(a) App Completeness               | "include demo account info (and turn on your back-end service!) if your app includes a login ... built-in demo mode in lieu of a demo account with prior approval" | Need a reachable demo server + credentials in App Review Information. Demo mode needs Apple approval - not worth it                                                                                                                                   |
| 2.3.1(a)                              | "Don't include any hidden, dormant, or undocumented features"                                                                                                      | Remove `spike.tsx` / test screens from release builds                                                                                                                                                                                                 |
| 2.3.7 / 2.3.10 (metadata) [U wording] | Don't put other app names in keywords; don't mention other platforms (Android, Google Play) in metadata                                                            | Keep keywords generic: jellyfin, media, player, offline, mkv                                                                                                                                                                                          |
| 2.4.1 [U wording]                     | iPhone apps should run on iPad                                                                                                                                     | `supportsTablet: false` -> runs in iPhone compatibility mode on iPad; reviewers often use iPads. Smoke test it                                                                                                                                        |
| 2.5.1                                 | Public APIs only                                                                                                                                                   | OK                                                                                                                                                                                                                                                    |
| 2.5.4                                 | "background services for their intended purposes: VoIP, audio playback, location, task completion, local notifications"                                            | Background URLSession needs **no** `UIBackgroundModes` entry. Only add `audio` if playback really continues on lock / background. Declaring it without real background audio = rejection risk                                                         |
| 4.2 Minimum Functionality             | "elevate it beyond a repackaged website"                                                                                                                           | Native player + downloads + offline: fine                                                                                                                                                                                                             |
| 4.8 Login Services                    | Applies only to third-party/social login                                                                                                                           | N/A - Jellyfin password + Quick Connect are the server's own auth, no Sign in with Apple needed                                                                                                                                                       |
| 5.1.1(i)                              | Privacy policy link required for all apps                                                                                                                          | `web/` privacy page (`/privacy`, GitHub Pages) - live once the repo is public                                                                                                                                                                         |
| 5.1.1(v)                              | "If your app supports account creation, you must also offer account deletion"                                                                                      | N/A - no account creation (accounts live on the user's server). Sign-out + remove-account already in M2. Say so in review notes                                                                                                                       |
| 5.2.1                                 | No protected third-party material without permission                                                                                                               | **Screenshots + demo server must use freely licensed media** (Blender open movies, public domain). No real movie posters. Name: "for Jellyfin" style only (Jellyfin branding policy: third parties must make non-affiliation clear, no Jellyfin logo) |
| 5.2.2                                 | Permitted to use third-party service                                                                                                                               | Jellyfin is user-run open source, nothing to authorise                                                                                                                                                                                                |
| 5.2.3 Audio/Video Downloading         | "should not facilitate illegal file sharing or ... download media from third-party sources (e.g. Apple Music, YouTube ...) without explicit authorization"         | Downloads come from the user's own server. Wording: "your own media", "your server". Avoid: "free movies", "stream anything", "torrent", "IPTV", "no subscription needed"                                                                             |

Other ASC items:

- **EU DSA trader status** must be declared (apps without it removed from EU storefronts since 2025-02-17) [V upcoming-requirements]. A free, non-monetised OSS app can declare **non-trader** (no public address/phone) [U].
- **Age rating**: new questionnaire (13+/16+/18+) mandatory since 2026-01-31, social-media question from Sept 2026 [V]. Answer: no UGC from us, no web browser, no social features - expect 4+.
- **SDK minimum**: since 2026-04-28 uploads must use Xcode 26+ / iOS 26 SDK [V]. Xcode 27 already used (§9) - fine.
- Category: Entertainment.

### A2. Privacy

**App Privacy label: "Data Not Collected".**

- Apple: "'Collect' refers to transmitting data off the device in a way that allows **you and/or your third-party partners** to access it ..." [V]. Credentials, DeviceId, playback progress go only to the user's own server - neither the developer nor a partner can access them.
- Revisit if we add: crash reporting (Sentry etc.), EAS Update (requests go to Expo servers), any analytics.

**Privacy manifest** (Apple required-reason API codes, [V]):

| Category       | Code   | Meaning                                                                             | Who needs it                                                                                  |
| -------------- | ------ | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| UserDefaults   | CA92.1 | Read/write info accessible only to the app                                          | RN, expo-constants, expo-system-ui                                                            |
| FileTimestamp  | C617.1 | Timestamps/size of files inside the app container                                   | RN, MPVKit (`stat`, `fstat`, `lstat`, `fstatat`), our downloads reconcile                     |
| SystemBootTime | 35F9.1 | Elapsed time between in-app events / timers                                         | RN, MPVKit (`mach_absolute_time`)                                                             |
| DiskSpace      | E174.1 | Check enough space to write files / delete when low - must change behaviour visibly | Download pre-flight (`Paths.availableDiskSpace`), offload cleanup; MPVKit `statvfs`/`fstatfs` |
| DiskSpace      | 85F4.1 | Display disk space to the user                                                      | Downloads screen storage bar                                                                  |

- Placement rule: "For each executable or dynamic library ... the bundle that includes the executable ... needs to include a privacy manifest" [V]. MPVKit is statically linked into the app binary, so its usage must be in the **app's** manifest. ExpoFileSystem ships its manifest inside a nested resource bundle of a dynamic framework, not at the framework root [V local], so Apple may not count it [U].
- Expo: "Apple does not correctly parse all the PrivacyInfo files included by static CocoaPods dependencies" -> declare in app config [V docs.expo.dev/guides/apple-privacy].
- MPVKit / FFmpeg / mpv are not on Apple's "commonly used third-party SDKs" signature list [U - list not re-fetched], so no SDK signature needed; app-level declaration is enough.

Proposed `app.json` (`expo.ios`):

```json
"privacyManifests": {
  "NSPrivacyTracking": false,
  "NSPrivacyTrackingDomains": [],
  "NSPrivacyCollectedDataTypes": [],
  "NSPrivacyAccessedAPITypes": [
    { "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryUserDefaults", "NSPrivacyAccessedAPITypeReasons": ["CA92.1"] },
    { "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryFileTimestamp", "NSPrivacyAccessedAPITypeReasons": ["C617.1"] },
    { "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategorySystemBootTime", "NSPrivacyAccessedAPITypeReasons": ["35F9.1"] },
    { "NSPrivacyAccessedAPIType": "NSPrivacyAccessedAPICategoryDiskSpace", "NSPrivacyAccessedAPITypeReasons": ["E174.1", "85F4.1"] }
  ]
}
```

Verify after `prebuild`: `ios/Rillwood/PrivacyInfo.xcprivacy` contains all four; Xcode Organizer -> "Generate Privacy Report" on the archive [U - pod install aggregation may append further reasons; that's fine].

Other plist hygiene:

- `expo-secure-store` adds a generic `NSFaceIDUsageDescription`. We don't use biometrics -> plugin option `faceIDPermission: false` (Expo permission plugins drop the key on `false`) [U - convention, verify after prebuild].
- `iOS Documents/` is backed up to iCloud -> set `isExcludedFromBackup` on the downloads directory (background-downloads.md #9). Apple's data storage guidelines cover re-downloadable data [U current enforcement].

### A3. Export compliance

| Fact                                                                                                                                                                                                                                                                   | Tag                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `ITSAppUsesNonExemptEncryption = NO` only if the app "including any third-party libraries it links against" uses no encryption or only exempt encryption                                                                                                               | [V] Apple "Complying with encryption export regulations" |
| ASC documentation table: Apple OS encryption only -> nothing; **industry-standard algorithm not provided by Apple OS -> French encryption declaration (only if distributed in France)**; proprietary -> CCATS + French declaration                                     | [V] ASC "Export compliance documentation for encryption" |
| Our JS `fetch` + background URLSession use Apple's TLS (exempt). **mpv/FFmpeg use their own TLS: MPVKit statically contains OpenSSL (`OPENSSL_init_*`, ciphers) and GnuTLS (`ff_gnutls_init`)** for `https` streams. `libsmbclient` (GPL extra) has its own crypto too | [V] `nm` on `MPVKit.xcframework/ios-arm64`               |

Options - answer the export questions based on the bundled TLS libraries:

1. **Current binary:** don't set the key on the first upload, answer ASC "standard encryption algorithms instead of, or in addition to, Apple OS". Either exclude France from availability, or upload the French declaration (ANSSI form) once; Apple then issues a code for `ITSEncryptionExportComplianceCode` so later builds skip the questions. US side: no CCATS for standard crypto [V].
2. **After the LGPL MPVKit rebuild:** build FFmpeg with Apple's TLS backend (`--enable-securetransport`, no OpenSSL/GnuTLS) and drop `libsmbclient` -> all TLS is Apple OS crypto -> `ios.config.usesNonExemptEncryption: false` becomes accurate [U - SecureTransport is deprecated but present; verify FFmpeg still supports it]. Add to the LGPL rebuild plan.

### A4. Background modes, local network, ATS

| Item                             | Recommendation                                                                                                                                                                                                                                                                                        | Tag                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Background downloads             | Background `URLSession` needs no `UIBackgroundModes`; `handleEventsForBackgroundURLSession` via AppDelegateSubscriber                                                                                                                                                                                 | [V] Apple background downloads doc (background-downloads.md) |
| `audio` mode                     | **Declared** (`app.json`, 2026-10-08): lock-screen / headphones Play plays the audio on in the background (the player pauses when the app is left). mpv module sets `AVAudioSession` `.playback` + Now Playing. Review note: video player with background audio playback from the lock screen         | [V] guideline 2.5.4                                          |
| `fetch` / `processing`           | Not needed in MVP (no background refresh; `BGContinuedProcessingTask` is post-MVP)                                                                                                                                                                                                                    | [V]                                                          |
| `NSLocalNetworkUsageDescription` | Required for LAN servers (Local Network Privacy covers URLSession, TN3179). Text: "Rillwood connects to your Jellyfin server on your local network." Must be our own string (see TL;DR #2)                                                                                                            | [V]                                                          |
| `NSBonjourServices` / multicast  | Not needed - no server discovery in MVP. Jellyfin UDP discovery (port 7359 broadcast) would need the `com.apple.developer.networking.multicast` entitlement (Apple approval)                                                                                                                          | [U]                                                          |
| ATS option A (current)           | `NSAllowsLocalNetworking: true`: http to IPs, `.local`, unqualified names. Remote servers must be https (or IP). No review justification needed                                                                                                                                                       | [V]                                                          |
| ATS option B                     | `NSAllowsArbitraryLoads: true` **and remove `NSAllowsLocalNetworking`**. Review justification: "Users connect to their own self-hosted Jellyfin media server, which often runs over plain HTTP on a home network or VPN. The server address is entered by the user; the app contacts no other hosts." | [V] Apple                                                    |
| Recommendation                   | Option B - users commonly reach servers over Tailscale MagicDNS / custom hostnames without TLS. Show an in-app warning for `http://` non-local URLs                                                                                                                                                   | [U]                                                          |

### A5. TestFlight external testing

- First build added to an external group goes through **Beta App Review**; later builds "may not require a full review" [V].
- Test Information needed: beta app description, feedback email, **sign-in info / demo account**; up to 10,000 testers; builds expire after 90 days [V].
- External testers = distribution -> §7: repo must be public first; corresponding source for mpv/FFmpeg published per release.
- Source link in the App Store description: not required by Apple. Optional (generic): "Rillwood is free and open source (GPL-3.0-or-later). Source code: <repo URL>." plus in-app licences screen (mpv / FFmpeg credits). Don't link Google Play / F-Droid (metadata rule) [U].

### A6. App Review notes - draft

```
Rillwood is a client for Jellyfin, an open-source media server that people run
themselves. The app has no accounts or backend of its own; it connects only to a
server address the user enters.

Demo server: https://<review-host>
Username: <user>   Password: <password>

1. Launch -> enter the server URL above -> Continue -> sign in.
2. Home / Library show the demo library (public domain and Creative Commons
   films only).
3. Open any movie -> Play (local video player, direct play, no transcoding).
4. Open any movie -> Download -> Downloads tab shows progress; turn on Airplane
   Mode and play it offline.
Quick Connect needs a second, already signed-in Jellyfin device to approve the
code; use password sign-in for review.
No account creation (accounts are managed on the user's own server), no
purchases, no ads, no analytics.
```

---

## B. Google Play

### B6. Policies and declarations

| Item                                   | Answer / action                                                                                                                                                                                                                                                                                                                                       | Tag                                |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| **Target API**                         | Since 2026-08-31 new apps + updates must target **API 36** (extension to 2026-11-01 on request). We're at 36 - compliant. API 37 expected **2027-08-31** (pattern; not yet on the Play page). At 37: `ACCESS_LOCAL_NETWORK` runtime permission for LAN, large-screen orientation lock ignored                                                         | [V] Play 11926878, [U] 2027 date   |
| **16 KB page size**                    | Play blocks updates without 16 KB support from **2027-02-01** (apps targeting 35+). Checked: all arm64 `.so` in `dev.jdtech.mpv:libmpv:1.0.0` have LOAD align `0x4000` - OK. Verify the final AAB: `bundletool dump config --bundle=app.aab \| grep alignment` -> `PAGE_ALIGNMENT_16K`, and `zipalign -v -c -P 16 4` on a universal APK               | [V] Android docs + local readelf   |
| **FGS declaration**                    | Required for every FGS type at targetSdk 34+: description, user impact if deferred/interrupted, **video link**, use-case pick. We declare `dataSync` (Android 8-13 path). Form text + video script in `docs/release/play-fgs-declaration.md`. Google recommends UIDT for user-initiated network transfers. Record the video against the review server | [V] Play 13392821                  |
| `RUN_USER_INITIATED_JOBS`              | Normal install-time permission, no Play declaration                                                                                                                                                                                                                                                                                                   | [V] background-downloads.md        |
| `POST_NOTIFICATIONS`                   | Runtime prompt (13+), no declaration                                                                                                                                                                                                                                                                                                                  | [V]                                |
| Photo/video permissions                | Not needed - downloads go to app-private storage. Keep `READ_MEDIA_*` out; block template `READ/WRITE_EXTERNAL_STORAGE` + `SYSTEM_ALERT_WINDOW` via `android.blockedPermissions`                                                                                                                                                                      | [U]                                |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | Don't request (restricted policy)                                                                                                                                                                                                                                                                                                                     | [U]                                |
| **Cleartext / LAN**                    | `expo-build-properties` `android.usesCleartextTraffic: true`. No Play policy against it                                                                                                                                                                                                                                                               | [V] build, [U] policy              |
| **App access**                         | "Provide all required details to enable access to your app" if restricted by login; "Any other instructions" field for special mechanisms; up to 5 sets. Give the demo server URL + user + password; server must stay up permanently (Play can re-review any update)                                                                                  | [V] Play 9859455                   |
| Broken functionality                   | Main risk for a server-required client: missing or expired app-access credentials                                                                                                                                                                                                                                                                     | [U]                                |
| **IP policy**                          | Not allowed: "Marketing images from movies, television..." in listing / screenshots; "encourage users to stream and download copyrighted works"; "Streaming apps that allow users to download a local copy of copyrighted content without authorization" -> describe downloads as "your own media from your server"                                   | [V] Play 9888072                   |
| Jellyfin name                          | "Name for Jellyfin" style, no Jellyfin logo, no implied affiliation, never in piracy promotion                                                                                                                                                                                                                                                        | [V] jellyfin.org branding          |
| Account deletion section               | "Does your app let users create accounts?" -> No (accounts are created on the user's server)                                                                                                                                                                                                                                                          | [U]                                |
| Content rating / target audience       | IARC questionnaire; target audience 18+ (or 13+) - avoid Families policy                                                                                                                                                                                                                                                                              | [U]                                |
| Developer verification                 | Android developer verification enforced on certified devices in BR/ID/SG/TH from 2026-09-30, global from 2027 - also affects F-Droid / sideload builds. Play Console account covers it                                                                                                                                                                | [V] Android developers blog / help |

**Data safety form** - privacy policy URL required even with no data collected [V].

| Question                       | Answer                                                                                                                                                                                                                                    | Notes                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Collects data?                 | Two defensible readings. Play: "'Collect' means transmitting data from your app off a user's device" - no "developer access" qualifier (unlike Apple) [V]                                                                                 |                                                                     |
| Option 1 (strict, recommended) | Collected: **User IDs** (username/user id), **Device or other IDs** (DeviceId); optionally **App activity - App interactions** (playback progress/played state). Purpose: App functionality, Account management. Not shared. Not optional | Over-declaring has no penalty; under-declaring is the violation [U] |
| Option 2 (lean)                | "No data collected"                                                                                                                                                                                                                       |                                                                     |
| Shared with third parties      | No (user's own server isn't a third party of ours; transfers are user-initiated) [U]                                                                                                                                                      |                                                                     |
| Encrypted in transit           | **No** - users may use http servers                                                                                                                                                                                                       |                                                                     |
| Deletion request               | No mechanism (data is on the user's server; removing the account in-app deletes local copies)                                                                                                                                             |                                                                     |

### B7. Closed testing for new personal accounts

- **Personal** Play Console accounts created **after 2023-11-13**: closed test with **>= 12 testers opted in continuously for >= 14 days**, then apply for production access on the Dashboard (questions about the test, app, readiness) [V Play 14151465]. Was 20 testers before Dec 2024 [U].
- Opt-out and re-opt-in resets that tester's 14 days [V].
- **Organization** accounts are not subject to it [V - page scopes to personal]; needs a D-U-N-S number and organisation verification [U].
- Personal account: developer name + contact email are public; physical address shown only when monetising [U].
- Practical: Play "internal testing" (up to 100) for the team first; promote to a closed track with a Google Group of 15+ testers (margin for drop-outs); first `.aab` upload is manual (§9).

---

## C. Both

### C8. Pre-submission checklist for M7

| Area          | Item                                                                                                                                                                                                         | Owner hint |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| Config        | `ios.privacyManifests` (4 categories, §A2); verify generated `PrivacyInfo.xcprivacy` + Xcode privacy report on the archive                                                                                   | app dev    |
| Config        | `ios.infoPlist.NSLocalNetworkUsageDescription` (own text); ATS decision (§A4) - if ArbitraryLoads, delete `NSAllowsLocalNetworking`                                                                          | app dev    |
| Config        | `UIBackgroundModes: ["audio"]` - declared (lock-screen playback, 2026-10-08)                                                                                                                                 | app dev    |
| Config        | `expo-secure-store` `faceIDPermission: false`                                                                                                                                                                | app dev    |
| Config        | `ios.config.usesNonExemptEncryption` per §A3; France availability or French declaration                                                                                                                      | maintainer |
| Config        | Android: `usesCleartextTraffic: true`; `blockedPermissions` (`SYSTEM_ALERT_WINDOW`, `READ_EXTERNAL_STORAGE`, `WRITE_EXTERNAL_STORAGE`); `aapt dump permissions` on the release APK matches the expected list | app dev    |
| Config        | Release build has no spike/test screens, no dev-client UI, no `console.*`                                                                                                                                    | app dev    |
| Build         | iOS archive with Xcode 26+ SDK; upload via Transporter; no ITMS-91053 / 9xxxx warnings in the email                                                                                                          | maintainer |
| Build         | Android AAB: targetSdk 36, `PAGE_ALIGNMENT_16K`, upload keystore backed up                                                                                                                                   | maintainer |
| Licences      | Repo public; corresponding source for mpv/FFmpeg per release; `THIRD_PARTY_NOTICES.md` current; in-app licences screen                                                                                       | maintainer |
| Privacy       | Privacy policy page (`web/`): no data collected by the project, data goes only to the user's server, tokens on device in secure storage, no analytics, contact email                                         | maintainer |
| Name          | Name/trademark checks (§11); "for Jellyfin" wording; no Jellyfin logo                                                                                                                                        | maintainer |
| Store listing | Screenshots from the demo server with freely licensed media only; no real posters; no other app names in keywords; no other-platform mentions on iOS                                                         | maintainer |
| Store listing | Support URL (repo issues or `web/`), marketing URL optional                                                                                                                                                  | maintainer |
| ASC           | App Privacy "Data Not Collected"; age rating questionnaire; DSA trader status; Entertainment category; export compliance; App Review notes (§A6)                                                             | maintainer |
| ASC           | TestFlight Test Information (description, feedback email, demo account)                                                                                                                                      | maintainer |
| Play          | Data safety (§B6), FGS dataSync declaration + video, app access instructions, content rating, target audience, ads = No, privacy policy URL                                                                  | maintainer |
| Play          | Closed test 12+ testers x 14 days (personal account) before production                                                                                                                                       | maintainer |
| Demo          | Review server up, HTTPS, credentials valid, downloads enabled, monitored (§C9)                                                                                                                               | maintainer |
| QA            | iPad compatibility-mode smoke test; fresh install -> demo server -> play -> download -> airplane mode -> offline play, on both platforms                                                                     | app dev    |

### C9. Demo server for reviewers

| Option                                                   | Pros                                                     | Cons                                                                                                                             | Tag                   |
| -------------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `demo.jellyfin.org/stable` (user `demo`, empty password) | Free, official, on 12.1.0                                | **Downloads disabled for `demo`** (`EnableContentDownloading: false`), hourly reset, no SLA, not ours to promise to Apple/Google | [V] probed 2026-10-02 |
| **Self-hosted review server (recommended)**              | Full control: downloads on, our test media, stable creds | Small running cost; must stay up                                                                                                 | [U]                   |

Setup (reuse `dev/jellyfin` compose, pinned 12.1):

- Small VPS or always-on box; HTTPS via reverse proxy (Caddy / Let's Encrypt) on a project subdomain; only the review user exposed.
- Non-admin user `review`: downloads on, remote access on, transcoding off (we direct play), can't change password (`EnableUserPreferenceAccess` off), no delete.
- Admin account with a different strong password, never shared.
- Media (~5-10 GB): Blender open movies (Big Buck Bunny, Sintel, Tears of Steel, Elephants Dream - CC BY) + public-domain films/episodes (e.g. Internet Archive "Feature Films" PD set); a short "series" of CC clips so series/season/episode screens work; include MKV + external SRT/ASS to show direct play. Keep the licence list in `dev/jellyfin/README`.
- Credentials: only in App Store Connect / Play Console fields and a maintainer password manager - **never in the repo**. Rotate after each review cycle if desired, but update both consoles first.
- Uptime check (any free monitor) - a down server during review = 2.1 rejection.
- Same server serves screenshots and the Play FGS video.

---

## D. Outcome

Folded into CLAUDE.md §8 M1/M7 and §11.

---

## Sources

Apple

- App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- App privacy details: https://developer.apple.com/app-store/app-privacy-details/
- Required reason API: https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api and `.../app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitype`
- Encryption: https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations ; https://developer.apple.com/help/app-store-connect/reference/app-information/export-compliance-documentation-for-encryption ; https://developer.apple.com/help/app-store-connect/manage-app-information/overview-of-export-compliance
- ATS: https://developer.apple.com/documentation/bundleresources/information-property-list/nsapptransportsecurity/nsallowslocalnetworking and `.../nsallowsarbitraryloads`
- TestFlight: https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview
- Upcoming requirements: https://developer.apple.com/news/upcoming-requirements/
- Expo privacy: https://docs.expo.dev/guides/apple-privacy/

Google

- Target API: https://support.google.com/googleplay/android-developer/answer/11926878
- New personal account testing: https://support.google.com/googleplay/android-developer/answer/14151465
- 16 KB pages: https://developer.android.com/guide/practices/page-sizes
- Data safety: https://support.google.com/googleplay/android-developer/answer/10787469
- App access: https://support.google.com/googleplay/android-developer/answer/9859455
- FGS declaration: https://support.google.com/googleplay/android-developer/answer/13392821
- IP policy: https://support.google.com/googleplay/android-developer/answer/9888072
- Developer verification: https://android-developers.googleblog.com/2026/03/android-developer-verification-rolling-out-to-all-developers.html

Jellyfin

- Branding: https://jellyfin.org/docs/general/contributing/branding/
- Demo server: https://demo.jellyfin.org (live probe 2026-10-02)
