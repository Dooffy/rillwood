// SPDX-License-Identifier: GPL-3.0-or-later
// The UIDT job's notification: what's left over every active download, a Pause action, tap opens the app. Without the
// notification permission (Android 13+) it's only shown in Task Manager; downloads run either way.
package app.rillwood.downloads

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.text.format.Formatter

object DownloadsNotification {
  const val ID = 0x5257
  private const val CHANNEL = "downloads"
  private const val ACTION_PAUSE = "app.rillwood.downloads.PAUSE"

  fun build(context: Context, count: Int, done: Long, total: Long, waiting: String?): Notification {
    val manager = context.getSystemService(NotificationManager::class.java)
    if (manager.getNotificationChannel(CHANNEL) == null) {
      manager.createNotificationChannel(NotificationChannel(CHANNEL, "Downloads", NotificationManager.IMPORTANCE_LOW))
    }
    val pause = PendingIntent.getBroadcast(
      context, 0, Intent(context, PauseReceiver::class.java).setAction(ACTION_PAUSE), PendingIntent.FLAG_IMMUTABLE
    )
    val open = context.packageManager.getLaunchIntentForPackage(context.packageName)?.let {
      PendingIntent.getActivity(context, 0, it, PendingIntent.FLAG_IMMUTABLE)
    }
    val title = when (count) {
      0 -> "Downloads"
      1 -> "Downloading 1 item"
      else -> "Downloading $count items"
    }
    val text = waiting ?: if (total > 0) {
      "${Formatter.formatShortFileSize(context, done)} of ${Formatter.formatShortFileSize(context, total)}"
    } else {
      null
    }
    val percent = if (total > 0) (done * 100 / total).toInt() else 0
    return Notification.Builder(context, CHANNEL)
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setContentTitle(title)
      .setContentText(text)
      .setProgress(100, percent, total == 0L)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setContentIntent(open)
      .addAction(Notification.Action.Builder(null, "Pause", pause).build())
      .build()
  }

  class PauseReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      if (intent.action != ACTION_PAUSE) return
      DownloadsQueue.start(context)
      DownloadsQueue.pauseAll("Paused from the notification")
    }
  }
}
