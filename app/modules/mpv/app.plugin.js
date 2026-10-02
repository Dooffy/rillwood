// SPDX-License-Identifier: GPL-3.0-or-later
// iOS: adds the MPVKit pod to the Podfile. MPVKit isn't on CocoaPods trunk, so the
// module's `s.dependency 'MPVKit'` needs an explicit podspec source.
// The renderer needs this fork's vo_avfoundation output.
// Android: pins the NDK libmpv was built with. libmpv.so links the NDK r29 libc++
// (`std::__from_chars_floating_point`); with RN's default NDK 27 the APK packs the
// older libc++_shared.so and dlopen fails on first playback.
// Both binaries are GPL builds today; LGPL rebuild post-MVP (CLAUDE.md §7).
const { withGradleProperties, withPodfile } = require('expo/config-plugins');

const MPVKIT_PODSPEC = 'https://raw.githubusercontent.com/streamyfin/MPVKit/0.41.0-av5/MPVKit.podspec';
// Must match the NDK of dev.jdtech.mpv:libmpv (modules/mpv/android/build.gradle).
const LIBMPV_NDK_VERSION = '29.0.14206865';

function addMpvKitPod(podfile) {
  const line = `  pod 'MPVKit', :podspec => '${MPVKIT_PODSPEC}'`;
  // Drop any previous MPVKit line so a URL bump doesn't leave two sources.
  const cleaned = podfile.replace(/^[ \t]*pod ['"]MPVKit['"].*\n?/gm, '');
  return cleaned.replace('use_expo_modules!', `use_expo_modules!\n${line}`);
}

function setNdkVersion(props) {
  const others = props.filter((p) => !(p.type === 'property' && p.key === 'ndkVersion'));
  return [...others, { type: 'property', key: 'ndkVersion', value: LIBMPV_NDK_VERSION }];
}

function withMpv(config) {
  config = withPodfile(config, (config) => {
    config.modResults.contents = addMpvKitPod(config.modResults.contents);
    return config;
  });
  return withGradleProperties(config, (config) => {
    config.modResults = setNdkVersion(config.modResults);
    return config;
  });
}

module.exports = withMpv;
module.exports.addMpvKitPod = addMpvKitPod;
module.exports.setNdkVersion = setNdkVersion;
module.exports.MPVKIT_PODSPEC = MPVKIT_PODSPEC;
module.exports.LIBMPV_NDK_VERSION = LIBMPV_NDK_VERSION;
