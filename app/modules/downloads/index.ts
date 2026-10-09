// SPDX-License-Identifier: GPL-3.0-or-later
// Background downloader - rules in docs/context/downloads.md. Only the downloads store (src/downloads.ts) imports this.
import { NativeModule, requireNativeModule } from 'expo';

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
  error: (e: { id: string; status?: number; message: string }) => void;
};

declare class DownloadsModule extends NativeModule<DownloadsEvents> {
  /** Auth headers kept in OS-protected storage, so transfers resume after process death without JS. */
  setCredential(accountId: string, headers: Record<string, string>): void;
  /** On sign-out. */
  clearCredential(accountId: string): void;
  /** Whole batch at once (a season = one call), kept in order. Native runs at most 2 at a time. */
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

export default requireNativeModule<DownloadsModule>('Downloads');
