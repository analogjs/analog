import { Component, inject } from '@angular/core';
import { StaticPageSeo } from '../seo';

@Component({
  template: `
    <main class="mx-auto max-w-3xl px-6 py-16">
      <h1 class="text-4xl font-bold tracking-tight">Privacy</h1>
      <div class="mt-6 space-y-4 leading-7" style="color: var(--fg-muted)">
        <p>
          analogjs.org is the documentation site for the open-source Analog
          framework. It has no user accounts, no sign-ups, and collects no
          personal information directly. This page describes the little data
          handling that does happen.
        </p>
        <h2 class="pt-4 text-2xl font-bold" style="color: var(--fg)">
          Analytics
        </h2>
        <p>
          The site uses Google Analytics with IP anonymization enabled to
          understand aggregate traffic — which pages are read and roughly where
          visitors come from. See
          <a class="link" href="https://policies.google.com/privacy"
            >Google's privacy policy</a
          >
          for how Google processes this data. Blocking the
          <code>googletagmanager.com</code> script (e.g. with a content blocker)
          disables analytics entirely without affecting the site.
        </p>
        <h2 class="pt-4 text-2xl font-bold" style="color: var(--fg)">Search</h2>
        <p>
          Documentation search is provided by Algolia DocSearch. When you use
          the search box, your query is sent to Algolia to return results; see
          <a class="link" href="https://www.algolia.com/policies/privacy/"
            >Algolia's privacy policy</a
          >.
        </p>
        <h2 class="pt-4 text-2xl font-bold" style="color: var(--fg)">
          Local storage
        </h2>
        <p>
          Your theme choice (light or dark) is stored in your browser's
          localStorage. It never leaves your device.
        </p>
        <h2 class="pt-4 text-2xl font-bold" style="color: var(--fg)">
          Questions
        </h2>
        <p>
          Questions about this page or the project's data practices can go to
          <a class="link" href="mailto:brandon@analogjs.org"
            >brandon&#64;analogjs.org</a
          >
          or an issue on
          <a class="link" href="https://github.com/analogjs/analog">GitHub</a>.
        </p>
      </div>
    </main>
  `,
  styles: [
    `
      .link {
        color: var(--brand);
      }
      .link:hover {
        text-decoration: underline;
      }
    `,
  ],
})
export default class PrivacyPage {
  constructor() {
    inject(StaticPageSeo).apply(
      '/privacy',
      'Privacy',
      'What data analogjs.org handles: anonymized Google Analytics, Algolia-powered search queries, and a theme preference in localStorage. No accounts, no direct data collection.',
    );
  }
}
