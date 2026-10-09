// SPDX-License-Identifier: GPL-3.0-or-later
// Background downloader - rules in docs/context/downloads.md. Scaffold: calls are no-ops until the
// background URLSession lands (M5).
import ExpoModulesCore

struct EnqueueItem: Record {
  @Field var id: String = ""
  @Field var accountId: String = ""
  @Field var url: String = ""
  @Field var dest: String = ""
  @Field var size: Double = 0
}

struct EnqueueOptions: Record {
  @Field var cellular: Bool = false
}

public class DownloadsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("Downloads")

    Events("progress", "done", "error")

    Function("setCredential") { (_ accountId: String, _ headers: [String: String]) in }

    Function("clearCredential") { (_ accountId: String) in }

    Function("enqueue") { (_ items: [EnqueueItem], _ options: EnqueueOptions) in }

    Function("pause") { (_ id: String) in }

    Function("resume") { (_ id: String) in }

    Function("cancel") { (_ id: String) in }

    Function("setCellular") { (_ cellular: Bool) in }

    AsyncFunction("getTasks") { () -> [[String: Any]] in
      []
    }
  }
}
