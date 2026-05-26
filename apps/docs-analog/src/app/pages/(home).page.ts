import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface Feature {
  title: string;
  body: string;
  logo: string;
  alt: string;
}

interface Sponsor {
  name: string;
  logo: string;
  url: string;
  scale?: string;
}

const FEATURES: Feature[] = [
  {
    title: 'Vite-powered',
    body: 'Analog is powered by Vite and Vitest, with the full ecosystem of plugins, integrations, and tools.',
    logo: '/img/logos/vite-logo.svg',
    alt: 'Vite',
  },
  {
    title: 'Hybrid SSR/SSG support',
    body: 'Hybrid Server-Side Rendering and Static Site Generation for Angular applications, out of the box.',
    logo: '/img/logos/angular-gradient.png',
    alt: 'Angular',
  },
  {
    title: 'File-based routing and API routes',
    body: 'File-based routing, API routes, and server-side data fetching — a seamless developer experience for Angular.',
    logo: '/img/logos/analog-logo.svg',
    alt: 'Analog',
  },
];

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
    logo: '/img/logos/nx-logo.light.svg',
    url: 'https://nx.dev',
    scale: 'h-10',
  },
  {
    name: 'Snyder Tech',
    logo: '/img/logos/snyder-logo.light.svg',
    url: 'https://snyder.tech',
    scale: 'h-10',
  },
  {
    name: 'CodeRabbit',
    logo: '/img/logos/coderabbit.svg',
    url: 'https://www.coderabbit.ai',
    scale: 'h-10',
  },
];

@Component({
  imports: [RouterLink],
  template: `
    <section class="mx-auto max-w-5xl px-6 py-20 text-center">
      <img
        src="/img/logos/analog-logo.svg"
        alt=""
        width="120"
        height="120"
        class="mx-auto"
      />
      <h1 class="mt-6 text-5xl font-bold tracking-tight">Analog</h1>
      <p class="mt-4 text-xl" style="color: var(--fg-muted)">
        The fullstack Angular meta-framework
      </p>
      <div class="mt-10 flex flex-wrap items-center justify-center gap-3">
        <a
          routerLink="/docs"
          class="inline-flex items-center rounded-md bg-rose-600 px-6 py-3 font-semibold text-white shadow hover:bg-rose-700"
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
    </section>

    <section
      class="mx-auto grid max-w-6xl gap-8 border-t px-6 py-16 sm:grid-cols-2 lg:grid-cols-3"
      style="border-color: var(--border)"
    >
      @for (f of features; track f.title) {
        <article class="flex flex-col items-center text-center">
          <img
            [src]="f.logo"
            [alt]="f.alt"
            width="96"
            height="96"
            class="mb-4"
          />
          <h2 class="text-lg font-semibold">{{ f.title }}</h2>
          <p class="mt-2 text-sm" style="color: var(--fg-muted)">
            {{ f.body }}
          </p>
        </article>
      }
    </section>

    <section class="bg-rose-600 px-6 py-12 text-white">
      <div class="mx-auto max-w-6xl text-center">
        <p class="text-sm sm:text-base">
          Analog is free, open source, and supported by our partners and
          sponsors.
        </p>

        <h2 class="mt-8 text-sm font-semibold uppercase tracking-wide">
          Partners
        </h2>
        <div class="mt-4 flex flex-wrap items-center justify-center gap-8">
          @for (p of partners; track p.name) {
            <a [href]="p.url" target="_blank" rel="noopener" [title]="p.name">
              <img
                [src]="p.logo"
                [alt]="p.name"
                class="h-12 brightness-0 invert"
              />
            </a>
          }
        </div>

        <h2 class="mt-10 text-sm font-semibold uppercase tracking-wide">
          Sponsors
        </h2>
        <div class="mt-4 flex flex-wrap items-center justify-center gap-8">
          @for (s of sponsors; track s.name) {
            <a [href]="s.url" target="_blank" rel="noopener" [title]="s.name">
              <img
                [src]="s.logo"
                [alt]="s.name"
                class="brightness-0 invert"
                [class]="s.scale || 'h-10'"
              />
            </a>
          }
        </div>

        <a
          href="mailto:partnerships@analogjs.org?subject=Partnerships"
          class="mt-10 inline-block rounded-md border border-white px-5 py-2 text-sm font-semibold hover:bg-white hover:text-rose-600"
        >
          Partner with Analog
        </a>
      </div>
    </section>
  `,
})
export default class HomePage {
  protected readonly features = FEATURES;
  protected readonly partners = PARTNERS;
  protected readonly sponsors = SPONSORS;
}
