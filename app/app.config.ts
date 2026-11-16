// SPDX-License-Identifier: GPL-3.0-or-later
// Extends app.json. `RILLWOOD_FILE_SHARING=1 npx expo prebuild` makes a dev build that shares the app's Documents
// folder with the Files app (inspect downloads and their snapshots on the phone). Opt-in: it also shows
// Documents/SQLite (the kv-store), so every other build - release included, however it's built - keeps it private.
// Whether users get it is a post-MVP decision (docs/open-items.md).
// `EAS_PROJECT_ID` links the build to the maintainer's EAS project (docs/release/ios.md), so no account id
// lives in the repo; forks use their own.
// Apple TV builds (`EXPO_TV=1` prebuild): the launch screen's mark bigger - read from the sofa across a 1920 pt screen.
import type { ConfigContext, ExpoConfig } from 'expo/config';

const fileSharing = process.env.RILLWOOD_FILE_SHARING === '1';
const easProjectId = process.env.EAS_PROJECT_ID;
const tv = process.env.EXPO_TV === '1';

/** Launch screen mark width on Apple TV (phones: app.json's 120). */
const TV_SPLASH_WIDTH = 280;

type Plugins = NonNullable<ExpoConfig['plugins']>;

const withTvSplash = (plugins: Plugins = []): Plugins =>
  plugins.map((plugin) =>
    Array.isArray(plugin) && plugin[0] === 'expo-splash-screen'
      ? [plugin[0], { ...plugin[1], imageWidth: TV_SPLASH_WIDTH }]
      : plugin,
  );

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  ios: {
    ...config.ios,
    infoPlist: {
      ...config.ios?.infoPlist,
      ...(fileSharing && { UIFileSharingEnabled: true, LSSupportsOpeningDocumentsInPlace: true }),
    },
  },
  ...(tv && { plugins: withTvSplash(config.plugins) }),
  ...(easProjectId && { extra: { ...config.extra, eas: { projectId: easProjectId } } }),
});
