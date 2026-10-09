// SPDX-License-Identifier: GPL-3.0-or-later
// Background downloader - rules in docs/context/downloads.md. Scaffold: calls are no-ops until the
// shared engine + UIDT / WorkManager runners land (M5).
package app.rillwood.downloads

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

class DownloadsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("Downloads")

    Events("progress", "done", "error")

    Function("setCredential") { _: String, _: Map<String, String> -> }

    Function("clearCredential") { _: String -> }

    Function("enqueue") { _: List<EnqueueItem>, _: EnqueueOptions -> }

    Function("pause") { _: String -> }

    Function("resume") { _: String -> }

    Function("cancel") { _: String -> }

    Function("setCellular") { _: Boolean -> }

    AsyncFunction("getTasks") { emptyList<Map<String, Any>>() }
  }
}
