// SPDX-License-Identifier: GPL-3.0-or-later
// Static site, no client JS. The deploy workflow passes the Pages address (SITE_URL, BASE_PATH);
// locally the site runs at the root.
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: process.env.SITE_URL,
  base: process.env.BASE_PATH || '/',
  trailingSlash: 'ignore',
});
