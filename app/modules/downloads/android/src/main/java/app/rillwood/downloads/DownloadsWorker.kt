// SPDX-License-Identifier: GPL-3.0-or-later
// Android 8-13 (and 14+ when the UIDT job can't be scheduled): one WorkManager worker as queue runner
// (docs/context/downloads.md). Same job as DownloadsJobService - it keeps the process alive as a `dataSync` foreground
// service while DownloadsQueue has work, and WorkManager starts it again after process death, a reboot or a stop
// (constraint lost, timeout), without JS. One unique work name per network rule; the transfers are the queue's.
package app.rillwood.downloads

import android.app.Notification
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.os.Build
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.ForegroundInfo
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkInfo
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import androidx.work.workDataOf
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred

class DownloadsWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params), DownloadsRunner {
  private val finished = CompletableDeferred<Unit>()

  // Android 12+ refuses a foreground service started from the background (and 15+ once the dataSync budget is
  // spent): the worker then runs as a plain job until WorkManager stops it (about 10 min) and runs it again.
  @Volatile
  private var foreground = false

  override val cellular = inputData.getBoolean(KEY_CELLULAR, false)

  override suspend fun doWork(): Result {
    DownloadsQueue.start(applicationContext)
    // An extra worker appended after one the queue finished: no foreground service (or dataSync time) for nothing.
    val active = CompletableDeferred<Boolean>()
    DownloadsQueue.hasActive { active.complete(it) }
    if (!active.await()) return Result.success()
    try {
      setForeground(foregroundInfo(DownloadsNotification.starting(applicationContext)))
      foreground = true
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      // not allowed right now - see `foreground`
    }
    DownloadsQueue.attach(this)
    try {
      finished.await()
    } finally {
      // WorkManager removes the notification with the service - a tick still queued mustn't post it again.
      foreground = false
      DownloadsQueue.detach(this)
      // Stopped by the user in Task Manager (12+): pause, like the job, so WorkManager's re-run doesn't start the
      // downloads again. Otherwise (constraint, timeout, replaced) the queue carries on while the process lives.
      if (isStopped && stopReason == WorkInfo.STOP_REASON_USER) DownloadsQueue.pauseAllNow("Stopped in Task Manager")
    }
    return Result.success()
  }

  override fun notify(notification: Notification) {
    if (!foreground || isStopped) return // a plain job's notification would outlive the process
    applicationContext.getSystemService(NotificationManager::class.java)
      .notify(DownloadsNotification.WORKER_ID, notification)
  }

  override fun finish() {
    finished.complete(Unit)
  }

  private fun foregroundInfo(notification: Notification) = if (Build.VERSION.SDK_INT >= 29) {
    ForegroundInfo(DownloadsNotification.WORKER_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
  } else {
    ForegroundInfo(DownloadsNotification.WORKER_ID, notification)
  }

  companion object {
    private const val KEY_CELLULAR = "cellular"

    private fun name(cellular: Boolean) = if (cellular) "downloads-any-network" else "downloads-wifi-only"

    /**
     * Enqueues the worker for the network rule; the other rule's work is cancelled. Appended, not kept: a worker the
     * queue just finished may not have returned yet, and one that started the process hasn't attached yet - the extra
     * one runs after it and ends at once if nothing is left. False if WorkManager refuses (not initialised, OEM) - the
     * queue then runs in-process.
     */
    fun schedule(context: Context, cellular: Boolean): Boolean = try {
      val manager = WorkManager.getInstance(context)
      manager.cancelUniqueWork(name(!cellular))
      val constraints = Constraints.Builder()
        .setRequiredNetworkType(if (cellular) NetworkType.CONNECTED else NetworkType.UNMETERED)
        .build()
      val request = OneTimeWorkRequestBuilder<DownloadsWorker>()
        .setConstraints(constraints)
        .setInputData(workDataOf(KEY_CELLULAR to cellular))
        .build()
      manager.enqueueUniqueWork(name(cellular), ExistingWorkPolicy.APPEND_OR_REPLACE, request)
      true
    } catch (e: Exception) {
      false
    }
  }
}
