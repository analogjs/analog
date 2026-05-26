import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

interface Feature {
  title: string;
  body: string;
  logo: string;
  alt: string;
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
  `,
})
export default class HomePage {
  protected readonly features = FEATURES;
}
