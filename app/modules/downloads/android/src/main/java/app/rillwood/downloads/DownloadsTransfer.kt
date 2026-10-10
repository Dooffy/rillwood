// SPDX-License-Identifier: GPL-3.0-or-later
// One HTTP transfer into `<dest>.part` (HTTP rules in docs/context/downloads.md): resume with Range + If-Range
// <Last-Modified>, stream to disk (never buffer), fsync. Runs on a transfer thread; DownloadsQueue decides what a
// result means.
package app.rillwood.downloads

import okhttp3.Call
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import java.io.File
import java.io.FileOutputStream
import java.io.IOException
import java.io.InputStream
import java.io.RandomAccessFile

sealed class TransferResult {
  /** `.part` holds exactly `size` bytes, synced. */
  object Complete : TransferResult()

  /** stop() was called. */
  object Stopped : TransferResult()

  /** The server file changed (416) - `.part` deleted, start again. */
  object Restart : TransferResult()

  data class Status(val code: Int) : TransferResult()

  /** No retry. */
  data class Failed(val reason: TaskReason, val message: String) : TransferResult()

  /** Connection failed or dropped - retry. */
  data class NetworkError(val message: String) : TransferResult()
}

class DownloadsTransfer(
  private val client: OkHttpClient,
  private val url: String,
  private val headers: Map<String, String>,
  private val part: File,
  private val size: Long,
  private val lastModified: String?,
  // Called before the first byte is written: the Last-Modified the file is now written against.
  private val onLastModified: (String?) -> Unit,
  // Called after every chunk (the caller throttles).
  private val onProgress: (Long) -> Unit,
) {
  @Volatile
  private var stopped = false

  @Volatile
  private var call: Call? = null

  fun stop() {
    stopped = true
    call?.cancel()
  }

  fun run(): TransferResult {
    var offset = if (part.exists()) part.length() else 0L
    // Can't check a partial file without its Last-Modified - start over.
    if (offset > size || (offset > 0 && offset < size && lastModified == null)) {
      part.delete()
      offset = 0
    }
    // Written in full before the process died, not renamed yet.
    if (offset == size) return sync()

    val request = Request.Builder().url(url).apply {
      for ((name, value) in headers) header(name, value)
      if (offset > 0) {
        header("Range", "bytes=$offset-")
        header("If-Range", lastModified!!)
      }
    }.build()
    val call = client.newCall(request).also { this.call = it }
    if (stopped) return TransferResult.Stopped
    return try {
      call.execute().use { receive(it, offset) }
    } catch (e: IOException) {
      if (stopped) TransferResult.Stopped else TransferResult.NetworkError(e.message ?: "Network error")
    }
  }

  private fun receive(response: Response, requested: Long): TransferResult {
    val offset = when (response.code) {
      206 -> {
        // Content-Range: bytes <start>-<end>/<total>
        val range = Regex("""bytes (\d+)-\d+/(\d+)""").find(response.header("Content-Range") ?: "")
        val start = range?.groupValues?.get(1)?.toLongOrNull()
        val total = range?.groupValues?.get(2)?.toLongOrNull()
        if (start != requested) return TransferResult.Failed(TaskReason.system, "Range starts at $start, not $requested")
        if (total != size) return TransferResult.Failed(TaskReason.system, "Size $total does not match $size")
        requested
      }
      200 -> 0L // new download, or the file changed since the partial one (If-Range didn't match)
      416 -> {
        part.delete()
        return TransferResult.Restart
      }
      else -> return TransferResult.Status(response.code)
    }
    val body = response.body ?: return TransferResult.NetworkError("No body")
    val length = body.contentLength()
    if (length >= 0 && offset + length != size) {
      return TransferResult.Failed(TaskReason.system, "Size ${offset + length} does not match $size")
    }
    // A 206 continues the same file - keep what it was checked against if the header is missing.
    onLastModified(response.header("Last-Modified") ?: lastModified.takeIf { offset > 0 })
    return write(body.byteStream(), offset)
  }

  private fun write(input: InputStream, offset: Long): TransferResult {
    val out = try {
      part.parentFile?.mkdirs()
      FileOutputStream(part, offset > 0) // 200 truncates
    } catch (e: IOException) {
      return TransferResult.Failed(TaskReason.storage, e.message ?: "Can't write the file")
    }
    out.use {
      val buffer = ByteArray(BUFFER_SIZE)
      var bytes = offset
      while (true) {
        if (stopped) return TransferResult.Stopped
        val n = try {
          input.read(buffer)
        } catch (e: IOException) {
          return if (stopped) TransferResult.Stopped else TransferResult.NetworkError(e.message ?: "Connection lost")
        }
        if (n < 0) break
        if (bytes + n > size) return TransferResult.Failed(TaskReason.system, "More than $size bytes")
        try {
          out.write(buffer, 0, n)
        } catch (e: IOException) {
          return TransferResult.Failed(TaskReason.storage, e.message ?: "Can't write the file")
        }
        bytes += n
        onProgress(bytes)
      }
      if (bytes != size) return TransferResult.NetworkError("Ended at $bytes of $size bytes")
      try {
        out.fd.sync()
      } catch (e: IOException) {
        return TransferResult.Failed(TaskReason.storage, e.message ?: "Can't write the file")
      }
    }
    return TransferResult.Complete
  }

  private fun sync(): TransferResult = try {
    RandomAccessFile(part, "rw").use { it.fd.sync() }
    TransferResult.Complete
  } catch (e: IOException) {
    TransferResult.Failed(TaskReason.storage, e.message ?: "Can't write the file")
  }

  private companion object {
    const val BUFFER_SIZE = 256 * 1024
  }
}
