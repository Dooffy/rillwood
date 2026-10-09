# SPDX-License-Identifier: GPL-3.0-or-later
Pod::Spec.new do |s|
  s.name           = 'Downloads'
  s.version        = '0.1.0'
  s.summary        = 'Rillwood background downloader'
  s.license        = 'GPL-3.0-or-later'
  s.author         = 'Rillwood contributors'
  s.homepage       = 'https://example.invalid/rillwood' # required by CocoaPods; no project site yet
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = '**/*.swift'
end
