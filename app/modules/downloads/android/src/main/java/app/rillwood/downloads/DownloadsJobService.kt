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

class DownloadsJobService : JobService() {
  override fun onStartJob(params: JobParameters): Boolean {
    // Within 10 s of the start or the job is stopped - the queue replaces it with the real one at once.
    notify(this, params, DownloadsNotification.build(this, 0, 0, 0, null))
    DownloadsQueue.start(this)
    DownloadsQueue.attachJob(this, params)
    return true
  }

  override fun onStopJob(params: JobParameters): Boolean {
    DownloadsQueue.detachJob(params)
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

    /**
     * Schedules the job for the network rule unless it's already pending / running (scheduling a running job's ID
     * would stop it); a job for the other rule is cancelled. The queue calls it only while the app is visible (the
     * only time a UIDT job may be scheduled) and no job is attached.
     */
    fun jobId(cellular: Boolean) = if (cellular) ANY_NETWORK else WIFI_ONLY

    fun schedule(context: Context, cellular: Boolean, remainingBytes: Long) {
      if (Build.VERSION.SDK_INT < 34) return
      val scheduler = context.getSystemService(JobScheduler::class.java)
      val id = jobId(cellular)
      val other = jobId(!cellular)
      try {
        if (scheduler.getPendingJob(other) != null) scheduler.cancel(other)
        if (scheduler.getPendingJob(id) != null) return
        val info = JobInfo.Builder(id, ComponentName(context, DownloadsJobService::class.java))
          .setUserInitiated(true)
          .setRequiredNetworkType(if (cellular) JobInfo.NETWORK_TYPE_ANY else JobInfo.NETWORK_TYPE_UNMETERED)
          .setEstimatedNetworkBytes(remainingBytes.coerceAtLeast(0), 0)
          .setPersisted(true)
          .build()
        scheduler.schedule(info)
      } catch (e: Exception) {
        // OEM refusal / not allowed right now: in-process until the next open
      }
    }

    fun notify(service: JobService, params: JobParameters, notification: Notification) {
      if (Build.VERSION.SDK_INT < 34) return
      service.setNotification(
        params, DownloadsNotification.ID, notification, JobService.JOB_END_NOTIFICATION_POLICY_REMOVE
      )
    }

    /** So the system sees the job making progress. */
    fun reportBytes(service: JobService, params: JobParameters, transferred: Long, estimated: Long) {
      if (Build.VERSION.SDK_INT < 34) return
      service.updateEstimatedNetworkBytes(params, estimated, 0)
      service.updateTransferredNetworkBytes(params, transferred, 0)
    }
  }
}
