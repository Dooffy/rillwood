// SPDX-License-Identifier: GPL-3.0-or-later
/** The source repository; the deploy workflow sets PUBLIC_REPO_URL, unset locally. */
export const repoUrl: string | undefined = import.meta.env.PUBLIC_REPO_URL || undefined;

/** A path under the site's base (GitHub Pages serves a project site under /<repo>/). */
export const href = (path = '') => `${import.meta.env.BASE_URL.replace(/\/$/, '')}/${path}`;
