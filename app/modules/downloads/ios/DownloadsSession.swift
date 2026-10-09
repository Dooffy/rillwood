// SPDX-License-Identifier: GPL-3.0-or-later
// Owner of the one background URLSession. Scaffold: id + pending relaunch handler only (M5).
import Foundation

enum DownloadsSession {
  static let identifier = "app.rillwood.client.downloads"
  // Kept until the session has delivered its events; called from urlSessionDidFinishEvents(forBackgroundURLSession:)
  // on the main queue.
  static var backgroundCompletion: (() -> Void)?
}
