// SPDX-License-Identifier: GPL-3.0-or-later
// Android 14+: one user-initiated data transfer (UIDT) job as queue runner (docs/context/downloads.md). It keeps the
// process alive while DownloadsQueue has work - no quota, no 6 h cap - and is started again by the system after
// process death or a reboot (`setPersisted`), without JS. One job ID per network rule; the transfers are the queue's.
package app.rillwood.downloads

import android.app.Notification
import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import android.os.Build
import java.util.concurrent.ConcurrentHashMap

class DownloadsJobService : JobService() {
  // By job ID - one per network rule, both briefly while the rule changes. Main thread + the queue's (finish).
  private val runners = ConcurrentHashMap<Int, Runner>()

  override fun onStartJob(params: JobParameters): Boolean {
    val runner = Runner(this, params)
    runners[params.jobId] = runner
    // Within 10 s of the start or the job is stopped - the queue replaces it with the real one at once.
    runner.notify(DownloadsNotification.starting(this))
    DownloadsQueue.start(this)
    DownloadsQueue.attach(runner)
    return true
  }

  override fun onStopJob(params: JobParameters): Boolean {
    runners.remove(params.jobId)?.let { DownloadsQueue.detach(it) }
    // Stopped by the user in Task Manager: the app can't schedule again until it's opened - pause, like the
    // notification's Pause, so the downloads don't look stuck.
    if (Build.VERSION.SDK_INT >= 34 && params.stopReason == JobParameters.STOP_REASON_USER) {
      DownloadsQueue.pauseAllNow("Stopped in Task Manager")
      return false
    }
    return true // constraint lost, thermal, low memory: the system starts it again
  }

  companion object {
    private const val WIFI_ONLY = 0x52570001
    private const val ANY_NETWORK = 0x52570002

    private fun jobId(cellular: Boolean) = if (cellular) ANY_NETWORK else WIFI_ONLY

    /**
     * Schedules the job for the network rule unless it's already pending / running (scheduling a running job's ID
     * would stop it); a job for the other rule is cancelled. The queue calls it only while the app is visible (the
     * only time a UIDT job may be scheduled) and no runner for the rule is attached. False when the system refuses
     * (OEM, not allowed right now) - the queue falls back to the WorkManager worker.
     */
    fun schedule(context: Context, cellular: Boolean, remainingBytes: Long): Boolean {
      if (Build.VERSION.SDK_INT < 34) return false
      val scheduler = context.getSystemService(JobScheduler::class.java)
      val id = jobId(cellular)
      val other = jobId(!cellular)
      return try {
        if (scheduler.getPendingJob(other) != null) scheduler.cancel(other)
        if (scheduler.getPendingJob(id) != null) return true
        val info = JobInfo.Builder(id, ComponentName(context, DownloadsJobService::class.java))
          .setUserInitiated(true)
          .setRequiredNetworkType(if (cellular) JobInfo.NETWORK_TYPE_ANY else JobInfo.NETWORK_TYPE_UNMETERED)
          .setEstimatedNetworkBytes(remainingBytes.coerceAtLeast(0), 0)
          .setPersisted(true)
          .build()
        scheduler.schedule(info) == JobScheduler.RESULT_SUCCESS
      } catch (e: Exception) {
        false
      }
    }
  }

  /** The running job as the queue's runner. */
  class Runner(private val service: DownloadsJobService, private val params: JobParameters) : DownloadsRunner {
    override val cellular = params.jobId == jobId(true)

    // For the system: transferred = what's gone from the remaining bytes since the job started; both only grow.
    private var estimated = 0L
    private var transferred = 0L

    override fun notify(notification: Notification) {
      if (Build.VERSION.SDK_INT < 34) return
      service.setNotification(
        params, DownloadsNotification.ID, notification, JobService.JOB_END_NOTIFICATION_POLICY_REMOVE
      )
    }

    /** So the system sees the job making progress. */
    override fun reportRemaining(remaining: Long) {
      if (Build.VERSION.SDK_INT < 34) return
      if (estimated == 0L) estimated = remaining
      transferred = maxOf(transferred, estimated - remaining)
      estimated = maxOf(estimated, transferred + remaining)
      service.updateEstimatedNetworkBytes(params, estimated, 0)
      service.updateTransferredNetworkBytes(params, transferred, 0)
    }

    override fun finish() {
      service.runners.remove(params.jobId, this)
      service.jobFinished(params, false)
    }
  }
}
