// SPDX-License-Identifier: GPL-3.0-or-later
// Adds the MPVKit pod to the Podfile. MPVKit isn't on CocoaPods trunk, so the
// module's `s.dependency 'MPVKit'` needs an explicit podspec source.
// The renderer needs this fork's vo_avfoundation output.
// GPL build - local spikes only, never ship (CLAUDE.md §7).
const { withPodfile } = require('expo/config-plugins');

const MPVKIT_PODSPEC = 'https://raw.githubusercontent.com/streamyfin/MPVKit/0.41.0-av5/MPVKit.podspec';

function addMpvKitPod(podfile) {
  const line = `  pod 'MPVKit', :podspec => '${MPVKIT_PODSPEC}'`;
  // Drop any previous MPVKit line so a URL bump doesn't leave two sources.
  const cleaned = podfile.replace(/^[ \t]*pod ['"]MPVKit['"].*\n?/gm, '');
  return cleaned.replace('use_expo_modules!', `use_expo_modules!\n${line}`);
}

function withMpv(config) {
  return withPodfile(config, (config) => {
    config.modResults.contents = addMpvKitPod(config.modResults.contents);
    return config;
  });
}

module.exports = withMpv;
module.exports.addMpvKitPod = addMpvKitPod;
module.exports.MPVKIT_PODSPEC = MPVKIT_PODSPEC;
