// SPDX-License-Identifier: GPL-3.0-or-later
// Auth headers per account, so a transfer restarted after process death can build its request without JS. One
// file, noBackupFilesDir/downloads/credentials, AES-GCM encrypted with a key in the Android Keystore (this device
// only, the key never leaves it). Never logged. Only touched on DownloadsQueue's thread.
package app.rillwood.downloads

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.AtomicFile
import org.json.JSONObject
import java.io.File
import java.io.FileNotFoundException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class DownloadsCredentials(context: Context) {
  private val file = AtomicFile(File(File(context.noBackupFilesDir, "downloads"), "credentials"))
  private var cache: MutableMap<String, Map<String, String>>? = null

  fun set(accountId: String, headers: Map<String, String>) {
    val all = load()
    all[accountId] = headers
    save(all)
  }

  fun clear(accountId: String) {
    val all = load()
    if (all.remove(accountId) != null) save(all)
  }

  fun headers(accountId: String): Map<String, String>? = load()[accountId]

  private fun load(): MutableMap<String, Map<String, String>> {
    cache?.let { return it }
    val all = mutableMapOf<String, Map<String, String>>()
    try {
      val json = JSONObject(String(decrypt(file.readFully())))
      for (accountId in json.keys()) {
        val h = json.getJSONObject(accountId)
        all[accountId] = h.keys().asSequence().associateWith { h.getString(it) }
      }
    } catch (e: FileNotFoundException) {
      // none yet
    } catch (e: Exception) {
      // Unreadable: not cached, so a passing Keystore / IO error is read again next time. If it stays unreadable (key
      // gone: data restored elsewhere, Keystore reset), transfers pause for auth and the next set() starts the file
      // over.
      return all
    }
    cache = all
    return all
  }

  private fun save(all: MutableMap<String, Map<String, String>>) {
    cache = all
    if (all.isEmpty()) return file.delete()
    val json = JSONObject()
    for ((accountId, headers) in all) json.put(accountId, JSONObject(headers))
    val data = try {
      encrypt(json.toString().toByteArray())
    } catch (e: Exception) {
      return // kept in memory for this process
    }
    val out = try {
      file.startWrite()
    } catch (e: Exception) {
      return
    }
    try {
      out.write(data)
      file.finishWrite(out)
    } catch (e: Exception) {
      file.failWrite(out)
    }
  }

  // [iv length][iv][ciphertext + tag]
  private fun encrypt(plain: ByteArray): ByteArray {
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, key())
    val iv = cipher.iv
    return byteArrayOf(iv.size.toByte()) + iv + cipher.doFinal(plain)
  }

  private fun decrypt(data: ByteArray): ByteArray {
    val ivSize = data[0].toInt()
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, data, 1, ivSize))
    return cipher.doFinal(data, 1 + ivSize, data.size - 1 - ivSize)
  }

  private fun key(): SecretKey {
    val keyStore = KeyStore.getInstance(KEYSTORE).apply { load(null) }
    (keyStore.getKey(ALIAS, null) as? SecretKey)?.let { return it }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
    generator.init(
      KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
        .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
        .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
        .setKeySize(256)
        .build()
    )
    return generator.generateKey()
  }

  private companion object {
    const val KEYSTORE = "AndroidKeyStore"
    const val ALIAS = "app.rillwood.client.downloads"
    const val TRANSFORMATION = "AES/GCM/NoPadding"
  }
}
