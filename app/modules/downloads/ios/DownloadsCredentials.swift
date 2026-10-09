// SPDX-License-Identifier: GPL-3.0-or-later
// Auth headers per account in the Keychain (after first unlock, this device only), so a retry or resume after
// process death can build its request without JS. Never logged. Only touched on DownloadsSession.queue.
import Foundation
import Security

final class DownloadsCredentials {
  private let service = "app.rillwood.client.downloads"
  private var cache: [String: [String: String]] = [:]

  func set(_ accountId: String, _ headers: [String: String]) {
    cache[accountId] = headers
    guard let data = try? JSONEncoder().encode(headers) else { return }
    SecItemDelete(query(accountId) as CFDictionary)
    var item = query(accountId)
    item[kSecValueData as String] = data
    item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
    SecItemAdd(item as CFDictionary, nil)
  }

  func clear(_ accountId: String) {
    cache[accountId] = nil
    SecItemDelete(query(accountId) as CFDictionary)
  }

  func headers(for accountId: String) -> [String: String]? {
    if let headers = cache[accountId] { return headers }
    var item = query(accountId)
    item[kSecReturnData as String] = true
    item[kSecMatchLimit as String] = kSecMatchLimitOne
    var result: AnyObject?
    guard SecItemCopyMatching(item as CFDictionary, &result) == errSecSuccess, let data = result as? Data,
      let headers = try? JSONDecoder().decode([String: String].self, from: data)
    else { return nil }
    cache[accountId] = headers
    return headers
  }

  private func query(_ accountId: String) -> [String: Any] {
    [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: accountId]
  }
}
