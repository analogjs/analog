import { Component, inject, PLATFORM_ID, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { DomSanitizer } from '@angular/platform-browser';
import { codeToHtml } from 'shiki';

const TICK = '`';

const CLIENT_CODE = [
  `// src/app/pages/products/[id].page.ts`,
  `import { Component } from '@angular/core';`,
  `import { injectLoad } from '@analogjs/router';`,
  `import type { load } from './[id].server';`,
  ``,
  `@Component({`,
  `  template: ${TICK}`,
  `    <h1>{{ product().name }}</h1>`,
  `    <p>{{ product().price | currency }}</p>`,
  `  ${TICK},`,
  `})`,
  `export default class ProductPage {`,
  `  protected readonly product = injectLoad<typeof load>();`,
  `}`,
].join('\n');

const SERVER_CODE = [
  `// src/app/pages/products/[id].server.ts`,
  `import type { PageServerLoad } from '@analogjs/router';`,
  `import { db } from '~/server/db';`,
  ``,
  `export const load = async ({`,
  `  params,`,
  `}: PageServerLoad) => {`,
  `  const product = await db.products.byId(`,
  `    params['id'],`,
  `  );`,
  `  return product;`,
  `};`,
].join('\n');

@Component({
  selector: 'docs-full-stack-example',
  template: `
    <div class="grid items-start gap-4">
      <article
        class="overflow-hidden rounded-xl border"
        style="border-color: var(--border)"
      >
        <header
          class="flex items-center justify-between border-b px-4 py-2 text-xs"
          style="border-color: var(--border); background: var(--bg-subtle); color: var(--fg-muted)"
        >
          <span>Page component (browser)</span>
          <span class="font-mono">.page.ts</span>
        </header>
        <div class="fs-example" [innerHTML]="clientHtml()"></div>
      </article>

      <article
        class="overflow-hidden rounded-xl border"
        style="border-color: var(--border)"
      >
        <header
          class="flex items-center justify-between border-b px-4 py-2 text-xs"
          style="border-color: var(--border); background: var(--bg-subtle); color: var(--fg-muted)"
        >
          <span>Server load (server-only)</span>
          <span class="font-mono">.server.ts</span>
        </header>
        <div class="fs-example" [innerHTML]="serverHtml()"></div>
      </article>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        min-width: 0;
      }
      :host ::ng-deep .fs-example pre {
        margin: 0;
        border-radius: 0;
        padding: 1rem;
        font-size: 12.5px;
        line-height: 1.55;
        overflow-x: auto;
        /* Dark backdrop so the SSR plain <pre> fallback and the shiki
           swap don't flash light first in light mode. */
        background: var(--demo-card-bg);
        color: var(--demo-card-fg);
      }
      :host ::ng-deep .fs-example pre code {
        font-family: var(--font-mono);
      }
      /* Force shiki's dark theme on these hero code blocks regardless
         of the page's light/dark mode — they live in a dark-on-dark
         hero card on the homepage. */
      :host ::ng-deep .fs-example .shiki,
      :host ::ng-deep .fs-example .shiki span {
        color: var(--shiki-dark) !important;
        background-color: var(--shiki-dark-bg) !important;
        font-style: var(--shiki-dark-font-style) !important;
        font-weight: var(--shiki-dark-font-weight) !important;
        text-decoration: var(--shiki-dark-text-decoration) !important;
      }
    `,
  ],
})
export class FullStackExample {
  private readonly sanitizer = inject(DomSanitizer);
  private readonly platformId = inject(PLATFORM_ID);

  protected readonly clientHtml = signal<unknown>('');
  protected readonly serverHtml = signal<unknown>('');

  constructor() {
    // Shiki is bundle-heavy; defer to the browser so SSR doesn't load
    // 1MB of grammars/themes per request. The static <pre> below
    // renders unstyled first paint, then shiki paints over it.
    if (!isPlatformBrowser(this.platformId)) {
      this.clientHtml.set(this.bare(CLIENT_CODE));
      this.serverHtml.set(this.bare(SERVER_CODE));
      return;
    }
    this.highlight(CLIENT_CODE).then((html) => this.clientHtml.set(html));
    this.highlight(SERVER_CODE).then((html) => this.serverHtml.set(html));
  }

  private async highlight(code: string): Promise<unknown> {
    const html = await codeToHtml(code, {
      lang: 'ts',
      themes: { light: 'github-light', dark: 'night-owl' },
    });
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  private bare(code: string): unknown {
    return this.sanitizer.bypassSecurityTrustHtml(
      `<pre><code>${escapeHtml(code)}</code></pre>`,
    );
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
