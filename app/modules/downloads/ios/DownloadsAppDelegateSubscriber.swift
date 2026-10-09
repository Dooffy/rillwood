// SPDX-License-Identifier: GPL-3.0-or-later
// iOS relaunches the app for finished background transfers. Expo waits for every subscriber's handler,
// so foreign session ids are answered straight away; ours goes to the session owner.
import ExpoModulesCore

public class DownloadsAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    handleEventsForBackgroundURLSession identifier: String,
    completionHandler: @escaping () -> Void
  ) {
    guard identifier == DownloadsSession.identifier else {
      completionHandler()
      return
    }
    DownloadsSession.backgroundCompletion = completionHandler
  }
}
