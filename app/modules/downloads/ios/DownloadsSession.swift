// SPDX-License-Identifier: GPL-3.0-or-later
// The one background URLSession (docs/context/downloads.md). Created at launch, works without JS: the daemon
// runs the transfers (and retry delays), this delegate moves finished files, maps HTTP status and persists the
// queue. Everything runs on `queue` (also the session's delegate queue).
import Foundation

final class DownloadsSession: NSObject, URLSessionDownloadDelegate {
  static let identifier = "app.rillwood.client.downloads"
  static let shared = DownloadsSession()
  // Relaunch handler from the app delegate; called on the main queue once the session has delivered its events.
  static var backgroundCompletion: (() -> Void)?

  private static let retryDelays: [TimeInterval] = [5, 30, 120]
  // Pending events for tasks that ended while the app was dead arrive right after the session is recreated;
  // records whose task is gone are restarted only after this grace period (keeps force-quit resume data).
  private static let reattachGrace: TimeInterval = 2
  private static let progressInterval: TimeInterval = 0.5

  let queue = DispatchQueue(label: "app.rillwood.client.downloads")
  private let store = DownloadsStore()
  private let credentials = DownloadsCredentials()
  private var session: URLSession!
  private var tasks: [String: URLSessionDownloadTask] = [:]
  private var lastProgress: [String: Date] = [:]
  // Paused tasks whose resume data hasn't arrived yet - a resume in that window waits for it.
  private var pausing: Set<String> = []
  private var onEvent: ((String, [String: Any?]) -> Void)?

  // MARK: - Calls from the module / app delegate

  func start() {
    queue.async { [self] in
      guard session == nil else { return }
      store.load()
      let config = URLSessionConfiguration.background(withIdentifier: Self.identifier)
      config.sessionSendsLaunchEvents = true
      config.isDiscretionary = false
      config.httpMaximumConnectionsPerHost = 2
      // Requests carry the network rule; the session must allow both.
      config.allowsCellularAccess = true
      config.allowsExpensiveNetworkAccess = true
      let delegateQueue = OperationQueue()
      delegateQueue.maxConcurrentOperationCount = 1
      delegateQueue.underlyingQueue = queue
      session = URLSession(configuration: config, delegate: self, delegateQueue: delegateQueue)
      session.getAllTasks { live in self.queue.async { self.reattach(live) } }
    }
  }

  func setEventHandler(_ handler: ((String, [String: Any?]) -> Void)?) {
    queue.async { self.onEvent = handler }
  }

  func setCredential(_ accountId: String, _ headers: [String: String]) {
    queue.async { self.credentials.set(accountId, headers) }
  }

  func clearCredential(_ accountId: String) {
    queue.async { self.credentials.clear(accountId) }
  }

  /// Whole batch at once (the background resume rate limiter delays tasks added one by one). Known ids are skipped.
  func enqueue(_ items: [TaskRecord], cellular: Bool) {
    queue.async { [self] in
      setCellularOnQueue(cellular)
      for item in items where store.record(item.id) == nil {
        store.set(item, persist: false)
        startTask(item.id)
      }
    }
  }

  func pause(_ id: String) {
    queue.async { [self] in
      guard var r = store.record(id), r.isActive else { return }
      r.state = .paused
      r.reason = .user
      guard let task = detach(&r) else { return }
      pausing.insert(id)
      task.cancel(byProducingResumeData: { data in
        self.queue.async {
          self.pausing.remove(id)
          guard let r = self.store.record(id) else { return }
          if let data { self.store.saveResumeData(data, for: id) }
          if r.isActive && self.tasks[id] == nil { self.startTask(id) }  // resumed meanwhile
        }
      })
    }
  }

  func resume(_ id: String) {
    queue.async { [self] in
      guard var r = store.record(id), !r.isActive else { return }
      r.attempts = 0
      guard pausing.contains(id) else {
        store.set(r, persist: false)
        return startTask(id)
      }
      r.state = .queued
      r.reason = nil
      store.set(r)  // the pause callback starts it with the resume data
    }
  }

  func cancel(_ id: String) {
    queue.async { [self] in
      tasks.removeValue(forKey: id)?.cancel()
      lastProgress[id] = nil
      store.remove(id)
    }
  }

  func setCellular(_ cellular: Bool) {
    queue.async { self.setCellularOnQueue(cellular) }
  }

  func snapshot(_ done: @escaping ([[String: Any]]) -> Void) {
    queue.async { [self] in
      done(
        store.records.map { r in
          var task: [String: Any] = [
            "id": r.id, "bytes": max(r.bytes, tasks[r.id]?.countOfBytesReceived ?? 0), "total": r.size,
            "state": r.state.rawValue,
          ]
          if let reason = r.reason { task["reason"] = reason.rawValue }
          return task
        })
    }
  }

  // MARK: - Queue

  private func reattach(_ live: [URLSessionTask]) {
    for case let task as URLSessionDownloadTask in live {
      guard store.writable else { break }  // records unknown - keep every task
      if let id = task.taskDescription, let r = store.record(id), r.isActive, r.taskId == task.taskIdentifier {
        tasks[id] = task
      } else {
        task.cancel()  // orphan: cancelled or finished on the JS side, or a superseded task
      }
    }
    queue.asyncAfter(deadline: .now() + Self.reattachGrace) { [self] in
      for r in store.records where r.isActive && tasks[r.id] == nil {
        startTask(r.id)
      }
    }
  }

  /// Starts (or restarts) the record's task with the current network rule, from resume data when there is some.
  /// A retry passes its delay: the daemon holds the task until then, also while the app is suspended or dead.
  private func startTask(_ id: String, after delay: TimeInterval = 0) {
    guard var r = store.record(id) else { return }
    tasks.removeValue(forKey: id)?.cancel()
    let cellular = store.cellular
    var task: URLSessionDownloadTask?
    if let data = store.takeResumeData(for: id) {
      let resumed = session.downloadTask(withResumeData: data)
      // Resume data replays the original request - drop it if it carries the other network rule.
      if resumed.originalRequest?.allowsCellularAccess == cellular {
        task = resumed
      } else {
        resumed.cancel()
      }
    }
    if task == nil {
      guard let url = URL(string: r.url), let headers = credentials.headers(for: r.accountId) else {
        return pauseForAuth(id, status: nil, message: "No credential for this account")
      }
      var request = URLRequest(url: url)
      for (name, value) in headers { request.setValue(value, forHTTPHeaderField: name) }
      request.allowsCellularAccess = cellular
      request.allowsExpensiveNetworkAccess = cellular  // Wi-Fi only = unmetered (no personal hotspot)
      task = session.downloadTask(with: request)
    }
    guard let task else { return }
    if delay > 0 { task.earliestBeginDate = Date(timeIntervalSinceNow: delay) }
    task.taskDescription = id
    r.state = .queued
    r.reason = nil
    r.taskId = task.taskIdentifier
    store.set(r)
    tasks[id] = task
    task.resume()
  }

  /// Unbinds the record from its task (later events of that task are ignored) and saves it.
  @discardableResult
  private func detach(_ r: inout TaskRecord) -> URLSessionDownloadTask? {
    r.taskId = nil
    store.set(r)
    lastProgress[r.id] = nil
    return tasks.removeValue(forKey: r.id)
  }

  /// Moves running tasks to the new rule: cancel with resume data, restart (startTask checks the replayed rule).
  private func setCellularOnQueue(_ cellular: Bool) {
    guard store.cellular != cellular else { return }
    store.cellular = cellular
    for id in Array(tasks.keys) {
      guard var r = store.record(id) else { continue }
      detach(&r)?.cancel(byProducingResumeData: { data in
        self.queue.async {
          guard let r = self.store.record(id) else { return }
          if let data { self.store.saveResumeData(data, for: id) }
          if r.isActive && r.taskId == nil { self.startTask(id) }
        }
      })
    }
  }

  private func retry(_ id: String, status: Int?, message: String) {
    guard var r = store.record(id) else { return }
    guard r.attempts < Self.retryDelays.count else {
      return fail(id, status == nil ? .network : .system, status: status, message: message)
    }
    let delay = Self.retryDelays[r.attempts]
    r.attempts += 1
    store.set(r, persist: false)
    startTask(id, after: delay)
  }

  private func fail(_ id: String, _ reason: TaskReason, status: Int? = nil, message: String) {
    stop(id, .error, reason, status: status, message: message)
  }

  private func pauseForAuth(_ id: String, status: Int?, message: String) {
    stop(id, .paused, .auth, status: status, message: message)
  }

  private func stop(_ id: String, _ state: TaskState, _ reason: TaskReason, status: Int?, message: String) {
    guard var r = store.record(id) else { return }
    r.state = state
    r.reason = reason
    detach(&r)
    onEvent?("error", ["id": id, "state": state.rawValue, "reason": reason.rawValue, "status": status, "message": message])
  }

  private func finish(_ id: String, file location: URL) {
    guard let r = store.record(id) else { return }
    guard var dest = DownloadsStore.resolve(r.dest) else {
      return fail(id, .system, message: "Destination outside Documents")
    }
    do {
      let fm = FileManager.default
      try fm.createDirectory(at: dest.deletingLastPathComponent(), withIntermediateDirectories: true)
      if fm.fileExists(atPath: dest.path) { try fm.removeItem(at: dest) }
      try fm.moveItem(at: location, to: dest)
      try DownloadsStore.excludeFromBackup(&dest)
    } catch {
      return fail(id, .storage, message: error.localizedDescription)
    }
    tasks[id] = nil
    lastProgress[id] = nil
    store.remove(id)
    onEvent?("done", ["id": id])
  }

  private static func fileSize(_ url: URL) -> Int64 {
    let attributes = try? FileManager.default.attributesOfItem(atPath: url.path)
    return (attributes?[.size] as? NSNumber)?.int64Value ?? -1
  }

  // MARK: - URLSessionDownloadDelegate

  func urlSession(
    _ session: URLSession, downloadTask: URLSessionDownloadTask, didWriteData bytesWritten: Int64,
    totalBytesWritten: Int64, totalBytesExpectedToWrite: Int64
  ) {
    guard let id = downloadTask.taskDescription, var r = store.record(id), r.taskId == downloadTask.taskIdentifier
    else { return }
    r.bytes = totalBytesWritten
    let started = r.state != .running
    r.state = .running
    if started { r.attempts = 0 }  // moving again - each stall gets the full retry budget
    store.set(r, persist: started)
    let now = Date()
    if let last = lastProgress[id], now.timeIntervalSince(last) < Self.progressInterval { return }
    lastProgress[id] = now
    onEvent?("progress", ["id": id, "bytes": totalBytesWritten, "total": r.size])
  }

  func urlSession(
    _ session: URLSession, downloadTask: URLSessionDownloadTask, didFinishDownloadingTo location: URL
  ) {
    guard let id = downloadTask.taskDescription, let r = store.record(id) else { return }
    // Error bodies "finish" too - the file must only move on a 2xx of the expected size.
    let status = (downloadTask.response as? HTTPURLResponse)?.statusCode ?? 0
    if (status == 200 || status == 206) && Self.fileSize(location) == r.size {
      // Kept from any task of the record - a superseded one may have finished while the app was dead, or just
      // before a pause landed.
      if let current = tasks[id], current.taskIdentifier != downloadTask.taskIdentifier { current.cancel() }
      return finish(id, file: location)
    }
    guard r.isActive, r.taskId == downloadTask.taskIdentifier else { return }
    switch status {
    case 200, 206: fail(id, .system, message: "Size \(Self.fileSize(location)) does not match \(r.size)")
    case 401: pauseForAuth(id, status: status, message: "Unauthorized")
    case 403: fail(id, .auth, status: status, message: "Downloads not allowed for this user")
    case 500...599: retry(id, status: status, message: "HTTP \(status)")
    default: fail(id, .system, status: status, message: "HTTP \(status)")
    }
  }

  func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
    guard let error = error as NSError?, let id = task.taskDescription, let r = store.record(id),
      r.taskId == task.taskIdentifier
    else { return }
    tasks[id] = nil
    if let data = error.userInfo[NSURLSessionDownloadTaskResumeData] as? Data { store.saveResumeData(data, for: id) }
    if error.userInfo[NSURLErrorBackgroundTaskCancelledReasonKey] as? Int == NSURLErrorCancelledReasonUserForceQuitApplication {
      return startTask(id)  // the app is open again - carry on
    }
    let reason: TaskReason?
    switch (error.domain, error.code) {
    case (NSURLErrorDomain, NSURLErrorCannotWriteToFile), (NSURLErrorDomain, NSURLErrorCannotCreateFile),
      (NSPOSIXErrorDomain, Int(ENOSPC)):
      reason = .storage
    case (NSURLErrorDomain, NSURLErrorBadURL), (NSURLErrorDomain, NSURLErrorUnsupportedURL),
      (NSURLErrorDomain, NSURLErrorAppTransportSecurityRequiresSecureConnection),
      (NSURLErrorDomain, NSURLErrorServerCertificateUntrusted):
      reason = .system
    default:
      reason = nil
    }
    if let reason {
      fail(id, reason, message: error.localizedDescription)
    } else {
      retry(id, status: nil, message: error.localizedDescription)
    }
  }

  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    DispatchQueue.main.async {
      Self.backgroundCompletion?()
      Self.backgroundCompletion = nil
    }
  }
}
