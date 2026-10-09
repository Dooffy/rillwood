// SPDX-License-Identifier: GPL-3.0-or-later
// Background downloader bridge - rules in docs/context/downloads.md. The work is in DownloadsSession.
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

final class InvalidDownloadException: GenericException<String>, @unchecked Sendable {
  override var reason: String {
    "Download \(param): dest must stay inside Documents, url must be http(s), size must be > 0"
  }
}

public class DownloadsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("Downloads")

    Events("progress", "done", "error")

    OnCreate { [weak self] in
      DownloadsSession.shared.setEventHandler { name, body in self?.sendEvent(name, body) }
      DownloadsSession.shared.start()
    }

    OnDestroy {
      DownloadsSession.shared.setEventHandler(nil)
    }

    Function("setCredential") { (accountId: String, headers: [String: String]) in
      DownloadsSession.shared.setCredential(accountId, headers)
    }

    Function("clearCredential") { (accountId: String) in
      DownloadsSession.shared.clearCredential(accountId)
    }

    // Checks the whole batch first: a bad item enqueues nothing.
    Function("enqueue") { (items: [EnqueueItem], options: EnqueueOptions) throws in
      let records = try items.map { item -> TaskRecord in
        let scheme = URL(string: item.url)?.scheme?.lowercased()
        guard DownloadsStore.resolve(item.dest) != nil, scheme == "http" || scheme == "https", item.size > 0 else {
          throw InvalidDownloadException(item.id)
        }
        return TaskRecord(
          id: item.id, accountId: item.accountId, url: item.url, dest: item.dest, size: Int64(item.size))
      }
      DownloadsSession.shared.enqueue(records, cellular: options.cellular)
    }

    Function("pause") { (id: String) in
      DownloadsSession.shared.pause(id)
    }

    Function("resume") { (id: String) in
      DownloadsSession.shared.resume(id)
    }

    Function("cancel") { (id: String) in
      DownloadsSession.shared.cancel(id)
    }

    Function("setCellular") { (cellular: Bool) in
      DownloadsSession.shared.setCellular(cellular)
    }

    AsyncFunction("getTasks") { (promise: Promise) in
      DownloadsSession.shared.snapshot { promise.resolve($0) }
    }
  }
}
