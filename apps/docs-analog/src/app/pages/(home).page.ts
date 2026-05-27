import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FileBasedRouting } from '../components/FileBasedRouting';
import { FullStackExample } from '../components/FullStackExample';
import { Terminal } from '../components/Terminal';

interface Sponsor {
  name: string;
  logo: string;
  url: string;
  scale?: string;
}

const PARTNERS: Sponsor[] = [
  {
    name: 'Zerops',
    logo: '/img/logos/zerops-logo.svg',
    url: 'https://zerops.io',
  },
];

const SPONSORS: Sponsor[] = [
  {
    name: 'Nx',
    logo: '/img/logos/nx-logo.dark.svg',
    url: 'https://nx.dev',
    scale: 'h-16',
  },
  {
    name: 'Snyder Tech',
    logo: '/img/logos/snyder-logo.dark.svg',
    url: 'https://snyder.tech',
    scale: 'h-16',
  },
  {
    name: 'CodeRabbit',
    logo: '/img/logos/coderabbit.svg',
    url: 'https://www.coderabbit.ai',
    scale: 'h-16',
  },
];

@Component({
  imports: [RouterLink, FileBasedRouting, FullStackExample, Terminal],
  template: `
    <section
      class="relative overflow-hidden px-6 pb-20 pt-24"
      style="
        background:
          radial-gradient(ellipse at 20% 0%, rgba(195, 15, 46, 0.18), transparent 55%),
          radial-gradient(ellipse at 80% 0%, rgba(124, 58, 237, 0.15), transparent 55%),
          var(--bg);
      "
    >
      <div class="mx-auto grid max-w-7xl items-center gap-12 lg:grid-cols-2">
        <div class="text-center lg:text-left">
          <img
            src="/img/logos/analog-logo.svg"
            alt=""
            width="96"
            height="96"
            class="mx-auto mb-6 lg:mx-0"
          />
          <h1
            class="bg-gradient-to-br from-rose-600 via-fuchsia-600 to-violet-600 bg-clip-text text-6xl font-bold leading-tight tracking-tight text-transparent sm:text-7xl"
            style="letter-spacing: -0.02em"
          >
            The fullstack <br />Angular meta-framework
          </h1>
          <p class="mt-6 text-xl" style="color: var(--fg-muted)">
            Vite-powered. File-based routing. API routes. SSR and SSG.
            Everything you need to build modern Angular apps and sites.
          </p>
          <div
            class="mt-10 flex flex-wrap items-center justify-center gap-3 lg:justify-start"
          >
            <a
              routerLink="/docs/introduction"
              class="inline-flex items-center rounded-md bg-gray-900 px-6 py-3 font-semibold text-white shadow hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-100"
            >
              Read the Docs
            </a>
            <a
              href="https://stackblitz.com/edit/github-vsxw5h?file=src%2Fapp%2Fapp.config.ts"
              target="_blank"
              rel="noopener"
              class="inline-flex items-center gap-2 rounded-md border px-6 py-3 font-semibold hover:bg-gray-50 dark:hover:bg-gray-900"
              style="border-color: var(--border)"
            >
              <img
                src="/img/logos/stackblitz-logo.svg"
                alt=""
                width="20"
                height="20"
              />
              Open in StackBlitz
            </a>
          </div>
        </div>
        <docs-terminal />
      </div>
    </section>

    <section class="border-t px-6 py-20" style="border-color: var(--border)">
      <div class="mx-auto max-w-6xl">
        <div class="mb-10 text-center">
          <p
            class="text-xs font-semibold uppercase tracking-wide"
            style="color: var(--brand)"
          >
            Routing
          </p>
          <h2 class="mt-2 text-4xl font-bold tracking-tight">
            Filesystem-based routing
          </h2>
          <p
            class="mx-auto mt-3 max-w-2xl text-base"
            style="color: var(--fg-muted)"
          >
            Files in
            <code
              class="rounded px-1.5 py-0.5"
              style="background: var(--hover-bg)"
              >src/app/pages/</code
            >
            become routes. Brackets are dynamic. Double brackets are catch-alls.
            Parentheses are pathless groups.
          </p>
        </div>
        <docs-file-routing />
      </div>
    </section>

    <section
      class="border-t px-6 py-20"
      style="
        border-color: var(--border);
        background:
          radial-gradient(ellipse at 50% 100%, rgba(124, 58, 237, 0.08), transparent 60%),
          var(--bg);
      "
    >
      <div class="mx-auto max-w-6xl">
        <div class="mb-10 text-center">
          <p
            class="text-xs font-semibold uppercase tracking-wide"
            style="color: var(--brand)"
          >
            Fullstack
          </p>
          <h2 class="mt-2 text-4xl font-bold tracking-tight">
            Client and server, one file pair
          </h2>
          <p
            class="mx-auto mt-3 max-w-2xl text-base"
            style="color: var(--fg-muted)"
          >
            Co-locate a server loader next to the page component. Analog runs it
            on the server, ships only the response to the client, and types the
            response end-to-end.
          </p>
        </div>
        <docs-full-stack-example />
      </div>
    </section>

    <section class="border-t px-6 py-12" style="border-color: var(--border)">
      <div class="mx-auto max-w-6xl text-center">
        <p class="text-sm sm:text-base" style="color: var(--fg-muted)">
          Analog is free, open source, and supported by our partners and
          sponsors.
        </p>

        <h2
          class="mt-8 text-sm font-semibold uppercase tracking-wide"
          style="color: var(--fg-muted)"
        >
          Partners
        </h2>
        <div class="mt-4 flex flex-wrap items-center justify-center gap-8">
          @for (p of partners; track p.name) {
            <a [href]="p.url" target="_blank" rel="noopener" [title]="p.name">
              <img
                [src]="p.logo"
                [alt]="p.name"
                class="h-20 dark:brightness-0 dark:invert"
              />
            </a>
          }
        </div>

        <h2
          class="mt-10 text-sm font-semibold uppercase tracking-wide"
          style="color: var(--fg-muted)"
        >
          Sponsors
        </h2>
        <div class="mt-4 flex flex-wrap items-center justify-center gap-8">
          @for (s of sponsors; track s.name) {
            <a [href]="s.url" target="_blank" rel="noopener" [title]="s.name">
              <img
                [src]="s.logo"
                [alt]="s.name"
                class="dark:brightness-0 dark:invert"
                [class]="s.scale || 'h-16'"
              />
            </a>
          }
        </div>

        <a
          href="mailto:partnerships@analogjs.org?subject=Partnerships"
          class="mt-10 inline-block rounded-md px-5 py-2 text-sm font-semibold text-white shadow"
          style="background: var(--brand)"
        >
          Partner with Analog
        </a>
      </div>
    </section>
  `,
})
export default class HomePage {
  protected readonly partners = PARTNERS;
  protected readonly sponsors = SPONSORS;
}
