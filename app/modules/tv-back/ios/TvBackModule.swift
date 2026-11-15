// SPDX-License-Identifier: GPL-3.0-or-later
// Apple TV: the remote's Back (Menu) key on a pushed screen. The native stack pops on Back before React Native's own
// Menu handler (on the app's root view) sees it, so `BackHandler` never hears it there. `TvBackView` wraps a screen's
// content: while `enabled` (something on the screen - an overlay, the controls - takes Back), its own Menu recognizer,
// nearer the focused view than the stack's, takes the press and sends `onBack`; the screen stays. Off: the press goes on
// to the stack as usual (Back leaves). iOS builds it too and never sees a Menu press.
import ExpoModulesCore
import UIKit

public class TvBackModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TvBack")

    View(TvBackView.self) {
      Events("onBack")

      Prop("enabled") { (view: TvBackView, enabled: Bool) in
        view.setEnabled(enabled)
      }
    }
  }
}

class TvBackView: ExpoView {
  let onBack = EventDispatcher()
  private let menu = UITapGestureRecognizer()

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    menu.addTarget(self, action: #selector(menuPressed))
    menu.allowedPressTypes = [NSNumber(value: UIPress.PressType.menu.rawValue)]
    // Taken: the press is cancelled for the responders above (the stack).
    menu.cancelsTouchesInView = true
    menu.isEnabled = false
    addGestureRecognizer(menu)
  }

  func setEnabled(_ enabled: Bool) {
    menu.isEnabled = enabled
  }

  @objc private func menuPressed() {
    onBack()
  }
}
