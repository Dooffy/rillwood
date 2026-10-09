// SPDX-License-Identifier: GPL-3.0-or-later
// Starts the background session at launch (also for background relaunches, before any JS). iOS relaunches the app
// for finished transfers; Expo waits for every subscriber's handler, so foreign session ids are answered straight
// away and ours is kept until the session has delivered its events.
import ExpoModulesCore

public class DownloadsAppDelegateSubscriber: ExpoAppDelegateSubscriber {
  public func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    DownloadsSession.shared.start()
    return true
  }

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
    DownloadsSession.shared.start()
  }
}
