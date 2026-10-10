// SPDX-License-Identifier: GPL-3.0-or-later
// The native queue (docs/context/downloads.md): order, max 2 transfers, network rule, retry, finished files.
// Works without JS. Every state change runs on `handler`'s thread; transfers run on their own threads and post
// their result back. In-process only for now - the transfers last as long as the process; the UIDT / WorkManager
// runners that keep it alive in the background come next (M5).
package app.rillwood.downloads

import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Handler
import android.os.HandlerThread
import android.os.SystemClock
import okhttp3.OkHttpClient
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

object DownloadsQueue {
  private const val MAX_RUNNING = 2
  private val RETRY_DELAYS = longArrayOf(5_000, 30_000, 120_000)
  private const val PROGRESS_INTERVAL = 500L

  private val handler = Handler(HandlerThread("app.rillwood.downloads").apply { start() }.looper)
  private val pool = Executors.newCachedThreadPool()
  private val client = OkHttpClient.Builder()
    .connectTimeout(15, TimeUnit.SECONDS)
    .readTimeout(30, TimeUnit.SECONDS) // a stalled connection fails and retries
    .build()

  private lateinit var store: DownloadsStore
  private lateinit var credentials: DownloadsCredentials
  private var started = false

  // Live transfers, incl. ones stopping (paused, cancelled, network gone) until their thread ends - a record
  // doesn't get a second transfer into the same `.part` meanwhile.
  private val runs = mutableMapOf<String, Run>()

  // Retry delays (uptime ms): the record waits until then.
  private val notBefore = mutableMapOf<String, Long>()

  // Default network capabilities; null = no network. Unknown until the first callback counts as fine.
  private var network: NetworkCapabilities? = null
  private var defaultNetwork: Network? = null
  private var networkKnown = false

  @Volatile
  private var onEvent: ((String, Map<String, Any?>) -> Unit)? = null
  private var eventOwner: Any? = null

  private class Run(val id: String, val part: File) {
    lateinit var transfer: DownloadsTransfer

    @Volatile
    var bytes = part.length() // 0 when there's none yet

    @Volatile
    var stopping = false
    var lastProgress = 0L
  }

  // MARK: - Calls from the module

  fun start(context: Context) {
    val app = context.applicationContext
    handler.post {
      if (started) return@post
      started = true
      store = DownloadsStore(app)
      credentials = DownloadsCredentials(app)
      store.load()
      // The process died mid-transfer: they start again from their `.part`.
      for (r in store.records) if (r.state == TaskState.running) r.state = TaskState.queued
      val connectivity = app.getSystemService(ConnectivityManager::class.java)
      connectivity.registerDefaultNetworkCallback(networkCallback, handler)
      pump()
    }
  }

  /** One module instance at a time; a reload's new instance may be created before the old one is destroyed. */
  @Synchronized
  fun setEventHandler(owner: Any, handler: (String, Map<String, Any?>) -> Unit) {
    eventOwner = owner
    onEvent = handler
  }

  @Synchronized
  fun clearEventHandler(owner: Any) {
    if (eventOwner !== owner) return
    eventOwner = null
    onEvent = null
  }

  fun setCredential(accountId: String, headers: Map<String, String>) {
    handler.post { credentials.set(accountId, headers) }
  }

  fun clearCredential(accountId: String) {
    handler.post { credentials.clear(accountId) }
  }

  /** Whole batch, in order. Known ids are skipped. */
  fun enqueue(items: List<TaskRecord>, cellular: Boolean) {
    handler.post {
      setCellularOnThread(cellular)
      for (item in items) {
        if (store.record(item.id) != null) continue
        store.add(item)
        if (!store.writable) fail(item, TaskReason.system, null, "Download state from a newer version or unreadable")
      }
      pump()
    }
  }

  fun pause(id: String) {
    handler.post {
      val r = store.record(id) ?: return@post
      if (!r.isActive) return@post
      r.state = TaskState.paused
      r.reason = TaskReason.user
      notBefore.remove(id)
      store.save()
      stopRun(id)
    }
  }

  fun resume(id: String) {
    handler.post {
      val r = store.record(id) ?: return@post
      if (r.isActive) return@post
      r.state = TaskState.queued
      r.reason = null
      r.attempts = 0
      store.save()
      pump() // a transfer still stopping starts again once its thread ends
    }
  }

  /** Deletes the partial file. */
  fun cancel(id: String) {
    handler.post {
      val r = store.record(id) ?: return@post
      notBefore.remove(id)
      stopRun(id)
      store.remove(id)
      partFile(r)?.delete() // again when a stopping transfer ends (it may still create it)
      pump()
    }
  }

  fun setCellular(cellular: Boolean) {
    handler.post { setCellularOnThread(cellular) }
  }

  fun snapshot(done: (List<Map<String, Any>>) -> Unit) {
    handler.post {
      done(
        store.records.map { r ->
          val bytes = runs[r.id]?.bytes ?: partFile(r)?.length() ?: 0L
          buildMap {
            put("id", r.id)
            put("bytes", bytes.toDouble())
            put("total", r.size.toDouble())
            put("state", r.state.name)
            r.reason?.let { put("reason", it.name) }
          }
        }
      )
    }
  }

  // MARK: - Queue

  private val pumpRunnable = Runnable { pump() }

  /** Starts queued records in order while fewer than MAX_RUNNING run; wakes again for the next retry delay. */
  private fun pump() {
    handler.removeCallbacks(pumpRunnable)
    if (!store.writable) return
    updateNetworkWait()
    if (networkBlocked) return
    val now = SystemClock.uptimeMillis()
    var running = runs.size // stopping ones too: their thread may still read and write
    var next = Long.MAX_VALUE
    for (r in store.records.toList()) {
      if (running >= MAX_RUNNING) break
      if (!r.isActive || r.id in runs) continue
      val at = notBefore[r.id] ?: 0L
      if (at > now) {
        next = minOf(next, at)
        continue
      }
      notBefore.remove(r.id)
      if (startRun(r)) running++
    }
    if (next != Long.MAX_VALUE) handler.postAtTime(pumpRunnable, next)
  }

  private fun startRun(r: TaskRecord): Boolean {
    val part = partFile(r) ?: run {
      fail(r, TaskReason.system, null, "Destination outside the app's files")
      return false
    }
    val headers = credentials.headers(r.accountId) ?: run {
      stop(r, TaskState.paused, TaskReason.auth, null, "No credential for this account")
      return false
    }
    val live = Run(r.id, part)
    live.transfer = DownloadsTransfer(
      client, r.url, headers, part, r.size, r.lastModified,
      onLastModified = { value ->
        handler.post {
          if (runs[r.id] !== live) return@post
          store.record(r.id)?.let {
            it.lastModified = value
            store.save()
          }
        }
      },
      onProgress = { bytes -> progress(live, r.size, bytes) },
    )
    runs[r.id] = live
    pool.execute {
      val result = live.transfer.run()
      handler.post { ended(live, result) }
    }
    return true
  }

  // Transfer thread.
  private fun progress(run: Run, total: Long, bytes: Long) {
    val first = run.lastProgress == 0L
    run.bytes = bytes
    if (run.stopping) return // paused / waiting for the network already told JS
    if (first) handler.post { flowing(run) }
    val now = SystemClock.uptimeMillis()
    if (!first && now - run.lastProgress < PROGRESS_INTERVAL) return
    run.lastProgress = now
    onEvent?.invoke("progress", mapOf("id" to run.id, "bytes" to bytes.toDouble(), "total" to total.toDouble()))
  }

  /** Bytes flow: running, the retry budget is full again, not waiting for the network. */
  private fun flowing(run: Run) {
    if (runs[run.id] !== run || run.stopping) return
    val r = store.record(run.id) ?: return
    if (r.state == TaskState.running) return
    r.state = TaskState.running
    r.reason = null
    r.attempts = 0
    store.save()
  }

  private fun ended(run: Run, result: TransferResult) {
    if (runs[run.id] === run) runs.remove(run.id)
    val r = store.record(run.id)
    when {
      // Cancelled: the transfer may have created the file after cancel deleted it.
      r == null -> run.part.delete()
      // Kept even when it finished just before a pause or a network stop landed.
      result == TransferResult.Complete -> finish(r, run.part)
      run.stopping -> {} // already moved on (paused, network gone, rule change)
      result is TransferResult.Restart -> {
        r.lastModified = null
        store.save()
      }
      result is TransferResult.Status -> when (result.code) {
        401 -> stop(r, TaskState.paused, TaskReason.auth, 401, "Unauthorized")
        403 -> fail(r, TaskReason.auth, 403, "Downloads not allowed for this user")
        in 500..599 -> retry(r, result.code, "HTTP ${result.code}")
        else -> fail(r, TaskReason.system, result.code, "HTTP ${result.code}")
      }
      result is TransferResult.Failed -> fail(r, result.reason, null, result.message)
      result is TransferResult.NetworkError -> {
        // Lost the network: waits for it without using up a retry (updateNetworkWait marks it).
        if (!networkBlocked) retry(r, null, result.message)
      }
      else -> {}
    }
    pump()
  }

  private fun stopRun(id: String) {
    val run = runs[id] ?: return
    run.stopping = true
    run.transfer.stop()
  }

  private fun retry(r: TaskRecord, status: Int?, message: String) {
    if (r.attempts >= RETRY_DELAYS.size) {
      return fail(r, if (status == null) TaskReason.network else TaskReason.system, status, message)
    }
    notBefore[r.id] = SystemClock.uptimeMillis() + RETRY_DELAYS[r.attempts]
    r.attempts++
    r.state = TaskState.queued
    store.save()
  }

  private fun fail(r: TaskRecord, reason: TaskReason, status: Int?, message: String) {
    stop(r, TaskState.error, reason, status, message)
  }

  private fun stop(r: TaskRecord, state: TaskState, reason: TaskReason, status: Int?, message: String) {
    r.state = state
    r.reason = reason
    store.save()
    onEvent?.invoke(
      "error",
      mapOf("id" to r.id, "state" to state.name, "reason" to reason.name, "status" to status, "message" to message),
    )
  }

  private fun finish(r: TaskRecord, part: File) {
    val dest = store.resolve(r.dest) ?: return fail(r, TaskReason.system, null, "Destination outside the app's files")
    if (dest.exists()) dest.delete()
    if (!part.renameTo(dest)) return fail(r, TaskReason.storage, null, "Can't move the finished file")
    store.remove(r.id)
    onEvent?.invoke("done", mapOf("id" to r.id))
  }

  private fun partFile(r: TaskRecord): File? = store.resolve(r.dest)?.let { File(it.path + ".part") }

  // MARK: - Network rule + wait

  private val networkCallback = object : ConnectivityManager.NetworkCallback() {
    override fun onCapabilitiesChanged(n: Network, capabilities: NetworkCapabilities) {
      defaultNetwork = n
      network = capabilities
      networkKnown = true
      pump()
    }

    override fun onLost(n: Network) {
      if (n != defaultNetwork) return // a late loss of the previous default network
      defaultNetwork = null
      network = null
      networkKnown = true
      pump()
    }
  }

  /** No network, or Wi-Fi only on a metered one (cellular, hotspot). */
  private val networkBlocked: Boolean
    get() {
      if (!networkKnown) return false
      val caps = network ?: return true
      return !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) ||
        (!store.cellular && !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED))
    }

  /**
   * The one place that marks active records as waiting for the network (or not any more) and tells JS. A blocked
   * network stops their transfers (the `.part` stays); pump starts them again once it's back.
   */
  private fun updateNetworkWait() {
    val blocked = networkBlocked
    for (r in store.records) {
      if (!r.isActive || (r.reason == TaskReason.network) == blocked) continue
      if (blocked) {
        r.state = TaskState.queued
        stopRun(r.id)
      }
      r.reason = if (blocked) TaskReason.network else null
      onEvent?.invoke("waiting", buildMap { put("id", r.id); r.reason?.let { put("reason", it.name) } })
    }
  }

  private fun setCellularOnThread(cellular: Boolean) {
    if (store.cellular == cellular) return
    store.cellular = cellular
    pump()
  }
}
