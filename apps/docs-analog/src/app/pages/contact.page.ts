import { Component, inject } from '@angular/core';
import { StaticPageSeo } from '../seo';

interface Channel {
  label: string;
  href: string;
  detail: string;
}

const CHANNELS: Channel[] = [
  {
    label: 'GitHub issues',
    href: 'https://github.com/analogjs/analog/issues',
    detail: 'Bug reports and feature requests for Analog and its packages.',
  },
  {
    label: 'GitHub discussions',
    href: 'https://github.com/analogjs/analog/discussions',
    detail: 'Questions, ideas, and show-and-tell with the community.',
  },
  {
    label: 'Discord',
    href: 'https://chat.analogjs.org',
    detail: 'Community support, Q&A, and general chat with the team.',
  },
  {
    label: 'Stack Overflow',
    href: 'https://stackoverflow.com/questions/tagged/analogjs',
    detail: 'Questions tagged analogjs.',
  },
  {
    label: 'X (Twitter)',
    href: 'https://twitter.com/analogjs',
    detail: 'Release announcements and project news.',
  },
];

@Component({
  template: `
    <main class="mx-auto max-w-3xl px-6 py-16">
      <h1 class="text-4xl font-bold tracking-tight">Contact</h1>
      <div class="mt-6 space-y-4 leading-7" style="color: var(--fg-muted)">
        <p>
          Analog is an open-source project — most conversations happen in
          public. Pick the channel that fits:
        </p>
        <ul class="space-y-3">
          @for (channel of channels; track channel.label) {
            <li>
              <a class="link font-semibold" [href]="channel.href">{{
                channel.label
              }}</a>
              <span> — {{ channel.detail }}</span>
            </li>
          }
        </ul>
        <h2 class="pt-4 text-2xl font-bold" style="color: var(--fg)">Email</h2>
        <p>
          For matters that don't fit a public channel, email works too. Support
          and general inquiries:
          <a class="link" href="mailto:brandon@analogjs.org"
            >brandon&#64;analogjs.org</a
          >. Sponsorships:
          <a class="link" href="mailto:sponsor@analogjs.org"
            >sponsor&#64;analogjs.org</a
          >. Partnerships:
          <a class="link" href="mailto:partnerships@analogjs.org"
            >partnerships&#64;analogjs.org</a
          >.
        </p>
        <p>
          Security reports: please use
          <a
            class="link"
            href="https://github.com/analogjs/analog/security/advisories/new"
            >GitHub private vulnerability reporting</a
          >
          rather than a public issue.
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
export default class ContactPage {
  protected readonly channels = CHANNELS;

  constructor() {
    inject(StaticPageSeo).apply(
      '/contact',
      'Contact',
      'How to reach the Analog team: GitHub issues and discussions, Discord, Stack Overflow, X, and email for support, sponsorships, and partnerships.',
    );
  }
}
