// SPDX-License-Identifier: GPL-3.0-or-later
const { describe, it, expect } = require('@jest/globals');
const { addMpvKitPod, setNdkVersion, LIBMPV_NDK_VERSION, MPVKIT_PODSPEC } = require('./app.plugin');

const podfile = "target 'Rillwood' do\n  use_expo_modules!\n  config = use_native_modules!\nend\n";
const podLine = `  pod 'MPVKit', :podspec => '${MPVKIT_PODSPEC}'`;

describe('addMpvKitPod', () => {
  it('adds the MPVKit pod right after use_expo_modules!', () => {
    expect(addMpvKitPod(podfile)).toContain(`use_expo_modules!\n${podLine}\n`);
  });

  it('is idempotent', () => {
    const once = addMpvKitPod(podfile);
    expect(addMpvKitPod(once)).toBe(once);
  });

  it('replaces an older MPVKit line instead of adding a second source', () => {
    const old = podfile.replace(
      'use_expo_modules!',
      "use_expo_modules!\n  pod 'MPVKit', :podspec => 'https://example.com/old.podspec'",
    );
    const out = addMpvKitPod(old);
    expect(out.match(/pod 'MPVKit'/g)).toHaveLength(1);
    expect(out).not.toContain('old.podspec');
    expect(out).toContain(podLine);
  });
});

describe('setNdkVersion', () => {
  const ndk = { type: 'property', key: 'ndkVersion', value: LIBMPV_NDK_VERSION };

  it('adds the libmpv NDK version', () => {
    const props = [{ type: 'property', key: 'hermesEnabled', value: 'true' }];
    expect(setNdkVersion(props)).toEqual([...props, ndk]);
  });

  it('replaces an existing ndkVersion instead of adding a second one', () => {
    const out = setNdkVersion([{ type: 'property', key: 'ndkVersion', value: '27.1.12297006' }]);
    expect(out).toEqual([ndk]);
  });
});
