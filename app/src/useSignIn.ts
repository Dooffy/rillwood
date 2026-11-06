// SPDX-License-Identifier: GPL-3.0-or-later
// Sign-in state shared by Sign in / Quick Connect (phone, tablet) and the TV Sign in: password form, whether the
// server offers Quick Connect, and the Quick Connect code while it waits for approval.
import { useEffect, useRef, useState } from 'react';

import { ApiError } from '@/api';
import { authErrorMessage, quickConnect, quickConnectEnabled, signIn } from '@/auth';
import { resetTo } from '@/navigation';
import type { Server } from '@/session';

/** Whether the server has Quick Connect on; undefined until it answers (false if it can't). */
export function useQuickConnectEnabled(server: Server | null): boolean | undefined {
  const [enabled, setEnabled] = useState<boolean>();
  useEffect(() => {
    if (!server) return;
    const controller = new AbortController();
    quickConnectEnabled(server, controller.signal)
      .then(setEnabled)
      .catch(() => {
        if (!controller.signal.aborted) setEnabled(false);
      });
    return () => controller.abort();
  }, [server]);
  return enabled;
}

/** Username + password form: sign in, then Home. A wrong password stays on the form with the reason. */
export function usePasswordSignIn(server: Server | null, initialUserName = '') {
  const [userName, setUserName] = useState(initialUserName);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  // Ref, not state: Go + tap in one frame must not sign in twice.
  const busy = useRef(false);
  const name = userName.trim();

  /** Typing clears the last error. */
  const edit = (set: (text: string) => void) => (text: string) => {
    set(text);
    setError(undefined);
  };

  const submit = async () => {
    if (!server || busy.current) return;
    if (name === '') {
      setError('Enter your username.');
      return;
    }
    busy.current = true;
    setError(undefined);
    setLoading(true);
    try {
      await signIn(server, name, password);
      resetTo('/home');
    } catch (e) {
      busy.current = false;
      setError(authErrorMessage(e, 'signIn'));
      setLoading(false);
    }
  };

  return {
    userName,
    setUserName: edit(setUserName),
    password,
    setPassword: edit(setPassword),
    canSubmit: name !== '',
    error,
    loading,
    submit,
  };
}

/**
 * Quick Connect while `active`: the code to show, then Home once it's approved elsewhere. `renewExpired`: an expired
 * code (the server forgets it after a while - 404) starts over with a new one instead of an error (TV keeps the code
 * on screen for as long as it's open).
 */
export function useQuickConnectCode(server: Server | null, { active = true, renewExpired = false } = {}) {
  const [code, setCode] = useState<string>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!server || !active) return;
    // Aborted on unmount / retry: stops polling and a cancelled sign-in never adds the account.
    const controller = new AbortController();
    quickConnect(server, { signal: controller.signal, onCode: setCode })
      .then(() => resetTo('/home'))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        if (renewExpired && e instanceof ApiError && e.status === 404) setAttempt((a) => a + 1);
        else setError(authErrorMessage(e, 'quickConnect'));
      });
    return () => controller.abort();
  }, [server, active, renewExpired, attempt]);

  function retry() {
    setError(undefined);
    setCode(undefined);
    setAttempt((a) => a + 1);
  }

  return { code, error, retry };
}
