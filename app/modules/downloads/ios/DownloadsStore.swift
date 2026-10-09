// SPDX-License-Identifier: GPL-3.0-or-later
// Native task records + resume data, so the queue survives process death without JS. Only touched on
// DownloadsSession.queue. Files live in Application Support/Downloads (not backed up, protected until first unlock).
import Foundation

enum TaskState: String, Codable {
  case queued, running, paused, error  // finished records are removed
}

enum TaskReason: String, Codable {
  case network, auth, user, storage, system
}

struct TaskRecord: Codable {
  var id: String
  var accountId: String
  var url: String
  var dest: String
  var size: Int64
  var state: TaskState = .queued
  var reason: TaskReason?
  var bytes: Int64 = 0
  var attempts: Int = 0
  // URLSessionTask.taskIdentifier of the current task; nil while paused, failed or being moved to a new rule.
  var taskId: Int?

  var isActive: Bool { state == .queued || state == .running }
}

final class DownloadsStore {
  private struct State: Codable {
    var version = 1
    var cellular = false
    var tasks: [TaskRecord] = []
  }

  private var state = State()
  // False when state.json exists but can't be read (before first unlock) or is from a newer version: nothing is
  // written over it and live tasks aren't treated as orphans.
  private(set) var writable = true
  private let encoder = JSONEncoder()
  private let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    .appendingPathComponent("Downloads", isDirectory: true)
  private var stateFile: URL { dir.appendingPathComponent("state.json") }

  var records: [TaskRecord] { state.tasks }
  var cellular: Bool {
    get { state.cellular }
    set {
      state.cellular = newValue
      save()
    }
  }

  func load() {
    // Our state, and Documents/downloads: the files and their snapshots (item JSON, images, subtitles - written by
    // JS). All of it can be downloaded again, so none of it goes into the backup; the flag on a folder covers its
    // contents.
    for case var url? in [dir, Self.resolve("downloads")] {
      try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
      try? Self.excludeFromBackup(&url)
    }
    guard FileManager.default.fileExists(atPath: stateFile.path) else { return }
    guard let data = try? Data(contentsOf: stateFile) else {
      writable = false
      return
    }
    // Corrupt: start empty, JS reconcile re-enqueues.
    guard let saved = try? JSONDecoder().decode(State.self, from: data) else { return }
    if saved.version == 1 { state = saved } else { writable = false }
  }

  func record(_ id: String) -> TaskRecord? {
    state.tasks.first { $0.id == id }
  }

  /// Insert or replace. Progress updates skip the disk write.
  func set(_ record: TaskRecord, persist: Bool = true) {
    if let i = state.tasks.firstIndex(where: { $0.id == record.id }) {
      state.tasks[i] = record
    } else {
      state.tasks.append(record)
    }
    if persist { save() }
  }

  func remove(_ id: String) {
    state.tasks.removeAll { $0.id == id }
    deleteResumeData(for: id)
    save()
  }

  // Resume data holds the original request incl. the auth header - same protection, deleted once used.
  func saveResumeData(_ data: Data, for id: String) {
    try? data.write(to: resumeFile(id), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
  }

  func takeResumeData(for id: String) -> Data? {
    guard let data = try? Data(contentsOf: resumeFile(id)) else { return nil }
    deleteResumeData(for: id)
    return data
  }

  private func deleteResumeData(for id: String) {
    try? FileManager.default.removeItem(at: resumeFile(id))
  }

  private func resumeFile(_ id: String) -> URL {
    dir.appendingPathComponent((id.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? id) + ".resume")
  }

  private func save() {
    guard writable, let data = try? encoder.encode(state) else { return }
    try? data.write(to: stateFile, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
  }

  /// `dest` (relative to Documents) as a file URL, or nil if it resolves outside Documents.
  static func resolve(_ dest: String) -> URL? {
    let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].standardizedFileURL
    let url = docs.appendingPathComponent(dest).standardizedFileURL
    return url.path.hasPrefix(docs.path + "/") ? url : nil
  }

  static func excludeFromBackup(_ url: inout URL) throws {
    var values = URLResourceValues()
    values.isExcludedFromBackup = true
    try url.setResourceValues(values)
  }
}
