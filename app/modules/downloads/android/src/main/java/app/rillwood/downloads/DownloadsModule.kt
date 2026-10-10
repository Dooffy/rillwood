// SPDX-License-Identifier: GPL-3.0-or-later
// Background downloader bridge - rules in docs/context/downloads.md. The work is in DownloadsQueue.
package app.rillwood.downloads

import android.net.Uri
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record

class EnqueueItem : Record {
  @Field val id: String = ""
  @Field val accountId: String = ""
  @Field val url: String = ""
  @Field val dest: String = ""
  @Field val size: Double = 0.0
}

class EnqueueOptions : Record {
  @Field val cellular: Boolean = false
}

class InvalidDownloadException(id: String) :
  CodedException("Download $id: dest must stay inside the app's files, url must be http(s), size must be > 0")

class DownloadsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Downloads")

    Events("progress", "done", "error", "waiting")

    OnCreate {
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      DownloadsQueue.setEventHandler(this@DownloadsModule) { name, body -> sendEvent(name, body) }
      DownloadsQueue.start(context)
    }

    OnDestroy {
      DownloadsQueue.clearEventHandler(this@DownloadsModule)
    }

    Function("setCredential") { accountId: String, headers: Map<String, String> ->
      DownloadsQueue.setCredential(accountId, headers)
    }

    Function("clearCredential") { accountId: String ->
      DownloadsQueue.clearCredential(accountId)
    }

    // Checks the whole batch first: a bad item enqueues nothing.
    Function("enqueue") { items: List<EnqueueItem>, options: EnqueueOptions ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val records = items.map { item ->
        val scheme = Uri.parse(item.url).scheme?.lowercase()
        val valid = DownloadsStore.resolve(context, item.dest) != null && (scheme == "http" || scheme == "https")
        if (!valid || item.size <= 0) {
          throw InvalidDownloadException(item.id)
        }
        TaskRecord(item.id, item.accountId, item.url, item.dest, item.size.toLong())
      }
      DownloadsQueue.enqueue(records, options.cellular)
    }

    Function("pause") { id: String ->
      DownloadsQueue.pause(id)
    }

    Function("resume") { id: String ->
      DownloadsQueue.resume(id)
    }

    Function("cancel") { id: String ->
      DownloadsQueue.cancel(id)
    }

    Function("setCellular") { cellular: Boolean ->
      DownloadsQueue.setCellular(cellular)
    }

    AsyncFunction("getTasks") { promise: Promise ->
      DownloadsQueue.snapshot { promise.resolve(it) }
    }
  }
}
