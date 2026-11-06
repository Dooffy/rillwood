// SPDX-License-Identifier: GPL-3.0-or-later
// Background downloader - rules in docs/context/downloads.md. Only the downloads store (src/downloads.ts) imports this.
// Apple TV has no downloads and tvOS doesn't build this module: there it's a stand-in that does nothing and has no tasks.
import { NativeModule, requireNativeModule } from 'expo';
import { Platform } from 'react-native';

export type TaskState = 'queued' | 'running' | 'waiting' | 'paused' | 'done' | 'error';

export type Task = {
  id: string;
  bytes: number;
  total: number;
  state: TaskState;
  reason?: 'network' | 'auth' | 'user' | 'storage' | 'system';
};

export type EnqueueItem = {
  id: string;
  accountId: string;
  url: string;
  /** Relative to `Paths.document` (the iOS container path changes). Native rejects a path that resolves outside it. */
  dest: string;
  /** `MediaSource.Size` in bytes - the file is finalized only when it reaches it. */
  size: number;
};

export type EnqueueOptions = { cellular: boolean };

export type DownloadsEvents = {
  /** Native-throttled (~500 ms). */
  progress: (e: { id: string; bytes: number; total: number }) => void;
  done: (e: { id: string }) => void;
  /**
   * A queued / running task (now queued) waits for the network (`reason: 'network'`: no network, or Wi-Fi only on
   * cellular or a hotspot) or not any more (no reason). iOS: the daemon holds such a task without an error; Android:
   * the queue stops it and starts it again from its `.part` once the network is back.
   */
  waiting: (e: { id: string; reason?: 'network' }) => void;
  /** The task stopped: paused (auth) or failed - `state` / `reason` as `getTasks` would report them. */
  error: (e: {
    id: string;
    state: 'paused' | 'error';
    reason: NonNullable<Task['reason']>;
    status?: number;
    message: string;
  }) => void;
};

declare class DownloadsModule extends NativeModule<DownloadsEvents> {
  /** Auth headers kept in OS-protected storage, so transfers resume after process death without JS. */
  setCredential(accountId: string, headers: Record<string, string>): void;
  /** On sign-out. JS then stops the account's tasks (iOS `cancel` - resume data holds the header; Android `pause`). */
  clearCredential(accountId: string): void;
  /**
   * Whole batch at once (a season = one call), kept in order. Native runs at most 2 at a time; known ids are skipped.
   * Throws (nothing enqueued) if a `dest` resolves outside Documents, a `url` isn't http(s) or a `size` isn't > 0.
   */
  enqueue(items: EnqueueItem[], options: EnqueueOptions): void;
  /** iOS keeps resume data, Android the `.part` file + `Last-Modified`. */
  pause(id: string): void;
  resume(id: string): void;
  /** Deletes partial data. */
  cancel(id: string): void;
  /** Network setting: false = Wi-Fi only (unmetered). Applies to queued and running tasks. */
  setCellular(cellular: boolean): void;
  getTasks(): Promise<Task[]>;
}

/** TV: every call does nothing, no tasks, no events (the UI offers no downloads there). */
class NoDownloads extends NativeModule<DownloadsEvents> {
  setCredential() {}
  clearCredential() {}
  enqueue() {}
  pause() {}
  resume() {}
  cancel() {}
  setCellular() {}
  getTasks(): Promise<Task[]> {
    return Promise.resolve([]);
  }
}

const Downloads: DownloadsModule = Platform.isTV
  ? new NoDownloads()
  : requireNativeModule<DownloadsModule>('Downloads');
export default Downloads;
