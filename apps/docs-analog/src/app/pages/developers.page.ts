import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StaticPageSeo } from '../seo';

interface Resource {
  label: string;
  href: string;
  detail: string;
}

const MACHINE_RESOURCES: Resource[] = [
  {
    label: '/openapi.json',
    href: '/openapi.json',
    detail:
      'OpenAPI 3.1 description of every machine-readable endpoint on this site.',
  },
  {
    label: '/api/v1/docs.json',
    href: '/api/v1/docs.json',
    detail:
      'JSON index of every docs page; each entry links its HTML, Markdown, and JSON forms.',
  },
  {
    label: '/llms.txt',
    href: '/llms.txt',
    detail:
      'Markdown docs index for LLMs (llmstxt.org), with when-to-use guidance for agents.',
  },
  {
    label: '/llms-full.txt',
    href: '/llms-full.txt',
    detail: 'The whole documentation corpus concatenated into one file.',
  },
  {
    label: '/sitemap.xml',
    href: '/sitemap.xml',
    detail: 'Sitemap of every page, including locale alternates.',
  },
];

@Component({
  imports: [RouterLink],
  template: `
    <main class="mx-auto max-w-3xl px-6 py-16">
      <h1 class="text-4xl font-bold tracking-tight">Developers</h1>
      <div class="mt-6 space-y-4 leading-7" style="color: var(--fg-muted)">
        <p>
          Everything you need to build with Analog, the fullstack Angular
          meta-framework — for people and for agents. No API keys or accounts
          are required for anything on this page.
        </p>

        <h2 class="pt-4 text-2xl font-bold" style="color: var(--fg)">
          Quickstart
        </h2>
        <p>
          Scaffold a new project with the official CLI, published on npm as
          <a class="link" href="https://www.npmjs.com/package/create-analog"
            >create-analog</a
          >:
        </p>
        <pre
          class="overflow-x-auto rounded-lg border p-4 text-sm"
          style="border-color: var(--border)"
        ><code>npm create analog&#64;latest</code></pre>
        <p>
          Or try it without installing anything in the
          <a class="link" href="/new">StackBlitz sandbox</a>. The
          <a class="link" routerLink="/docs/getting-started"
            >getting started guide</a
          >
          covers the rest, and the
          <a class="link" routerLink="/docs/introduction">documentation</a>
          goes deep on routing, SSR/SSG, API routes, and the Vite plugins.
        </p>

        <h2 class="pt-4 text-2xl font-bold" style="color: var(--fg)">
          Machine-readable resources
        </h2>
        <p>
          The whole site is agent-friendly: unknown paths return real HTTP 404s
          (structured JSON errors under <code>/api/</code>), and every docs page
          is served as raw Markdown at its URL plus <code>.md</code> — or by
          requesting the page with <code>Accept: text/markdown</code>.
        </p>
        <ul class="space-y-3">
          @for (res of resources; track res.label) {
            <li>
              <a class="link font-mono font-semibold" [href]="res.href">{{
                res.label
              }}</a>
              <span> — {{ res.detail }}</span>
            </li>
          }
        </ul>

        <h2 class="pt-4 text-2xl font-bold" style="color: var(--fg)">
          Source, packages, and support
        </h2>
        <p>
          Analog is MIT-licensed and developed at
          <a class="link" href="https://github.com/analogjs/analog"
            >github.com/analogjs/analog</a
          >. The framework ships as scoped npm packages —
          <a
            class="link"
            href="https://www.npmjs.com/package/@analogjs/platform"
            >&#64;analogjs/platform</a
          >, <code>&#64;analogjs/router</code>,
          <code>&#64;analogjs/content</code>,
          <code>&#64;analogjs/vite-plugin-angular</code>, and more. See
          <a class="link" routerLink="/docs/contributing">contributing</a> to
          get involved, or ask questions on
          <a class="link" href="https://chat.analogjs.org">Discord</a> and
          <a class="link" routerLink="/docs/support">support</a>.
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
export default class DevelopersPage {
  protected readonly resources = MACHINE_RESOURCES;

  constructor() {
    inject(StaticPageSeo).apply(
      '/developers',
      'Developers',
      'The AnalogJS developer portal: quickstart with the create-analog CLI, StackBlitz sandbox, documentation, and machine-readable resources (OpenAPI spec, JSON docs API, llms.txt).',
    );
  }
}
