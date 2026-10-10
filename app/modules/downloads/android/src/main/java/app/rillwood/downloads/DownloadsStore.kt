// SPDX-License-Identifier: GPL-3.0-or-later
// Native task records, so the queue survives process death without JS. Only touched on DownloadsQueue's thread.
// noBackupFilesDir/downloads/state.json (never backed up). Bytes aren't kept: the `.part` file's length is the
// resume offset.
package app.rillwood.downloads

import android.content.Context
import android.util.AtomicFile
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileNotFoundException

@Suppress("EnumEntryName") // names are the JS contract values
enum class TaskState { queued, running, paused, error }

@Suppress("EnumEntryName")
enum class TaskReason { network, auth, user, storage, system }

class TaskRecord(
  val id: String,
  val accountId: String,
  val url: String,
  val dest: String,
  val size: Long,
  var state: TaskState = TaskState.queued,
  var reason: TaskReason? = null,
  var attempts: Int = 0,
  // Last-Modified of the file being written - sent as If-Range on resume (Jellyfin has no ETag).
  var lastModified: String? = null,
) {
  val isActive get() = state == TaskState.queued || state == TaskState.running
}

class DownloadsStore(private val context: Context) {
  private val dir = File(context.noBackupFilesDir, "downloads")
  private val file = AtomicFile(File(dir, "state.json"))
  private val tasks = mutableListOf<TaskRecord>()
  private var savedCellular = false

  // False when state.json can't be read or is from a newer version: nothing is written over it.
  var writable = true
    private set

  val records: List<TaskRecord> get() = tasks

  var cellular: Boolean
    get() = savedCellular
    set(value) {
      savedCellular = value
      save()
    }

  fun load() {
    dir.mkdirs()
    val text = try {
      String(file.readFully())
    } catch (e: FileNotFoundException) {
      return
    } catch (e: Exception) {
      writable = false
      return
    }
    // Corrupt: start empty, JS reconcile re-enqueues.
    val json = try {
      JSONObject(text)
    } catch (e: Exception) {
      return
    }
    if (json.optInt("version") != 1) {
      writable = false
      return
    }
    savedCellular = json.optBoolean("cellular")
    val list = json.optJSONArray("tasks") ?: JSONArray()
    for (i in 0 until list.length()) {
      val t = list.optJSONObject(i) ?: continue
      // A bad record is dropped (JS reconcile re-enqueues it), never a crash at every launch.
      tasks += try {
        record(t)
      } catch (e: Exception) {
        continue
      }
    }
  }

  private fun record(t: JSONObject) =
    TaskRecord(
      id = t.getString("id"),
      accountId = t.getString("accountId"),
      url = t.getString("url"),
      dest = t.getString("dest"),
      size = t.getLong("size"),
      state = TaskState.valueOf(t.getString("state")),
      reason = t.optString("reason").takeIf { it.isNotEmpty() }?.let { TaskReason.valueOf(it) },
      attempts = t.optInt("attempts"),
      lastModified = t.optString("lastModified").takeIf { it.isNotEmpty() },
    )

  fun record(id: String): TaskRecord? = tasks.firstOrNull { it.id == id }

  fun add(record: TaskRecord) {
    tasks += record
    save()
  }

  fun remove(id: String) {
    tasks.removeAll { it.id == id }
    save()
  }

  /** Writes the records after a change to one (they're changed in place). */
  fun save() {
    if (!writable) return
    val list = JSONArray()
    for (t in tasks) {
      list.put(
        JSONObject()
          .put("id", t.id)
          .put("accountId", t.accountId)
          .put("url", t.url)
          .put("dest", t.dest)
          .put("size", t.size)
          .put("state", t.state.name)
          .put("reason", t.reason?.name)
          .put("attempts", t.attempts)
          .put("lastModified", t.lastModified)
      )
    }
    val json = JSONObject().put("version", 1).put("cellular", savedCellular).put("tasks", list)
    val out = try {
      file.startWrite()
    } catch (e: Exception) {
      return
    }
    try {
      out.write(json.toString().toByteArray())
      file.finishWrite(out) // fsyncs
    } catch (e: Exception) {
      file.failWrite(out)
    }
  }

  fun resolve(dest: String): File? = resolve(context, dest)

  companion object {
    /** `dest` (relative to filesDir = expo-file-system's `Paths.document`) as a file, or null if it's outside. */
    fun resolve(context: Context, dest: String): File? {
      val root = context.filesDir.canonicalFile
      val file = File(root, dest).canonicalFile
      return file.takeIf { it.path.startsWith(root.path + File.separator) }
    }
  }
}
