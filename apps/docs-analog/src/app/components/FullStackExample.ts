import { Component } from '@angular/core';

const CLIENT_CODE = `// src/app/pages/products/[id].page.ts
import { Component, inject } from '@angular/core';
import { injectLoad } from '@analogjs/router';
import type { load } from './[id].server';

@Component({
  template: \`
    <h1>{{ product().name }}</h1>
    <p>{{ product().price | currency }}</p>
  \`,
})
export default class ProductPage {
  protected readonly product = injectLoad<typeof load>();
}`;

const SERVER_CODE = `// src/app/pages/products/[id].server.ts
import type { PageServerLoad } from '@analogjs/router';
import { db } from '~/server/db';

export const load = async ({
  params,
}: PageServerLoad) => {
  const product = await db.products.byId(
    params['id'],
  );
  return product;
};`;

@Component({
  selector: 'docs-full-stack-example',
  template: `
    <div class="grid items-start gap-6 lg:grid-cols-2">
      <article
        class="overflow-hidden rounded-xl border"
        style="border-color: var(--border)"
      >
        <header
          class="flex items-center justify-between border-b px-4 py-2 text-xs"
          style="border-color: var(--border); background: var(--hover-bg); color: var(--fg-muted)"
        >
          <span>Page component (browser)</span>
          <span class="font-mono">.page.ts</span>
        </header>
        <pre
          class="m-0 overflow-x-auto p-4 font-mono text-[12.5px] leading-[1.65]"
          style="background: var(--bg)"
        ><code>{{ clientCode }}</code></pre>
      </article>

      <article
        class="overflow-hidden rounded-xl border"
        style="border-color: var(--border)"
      >
        <header
          class="flex items-center justify-between border-b px-4 py-2 text-xs"
          style="border-color: var(--border); background: var(--hover-bg); color: var(--fg-muted)"
        >
          <span>Server load (server-only)</span>
          <span class="font-mono">.server.ts</span>
        </header>
        <pre
          class="m-0 overflow-x-auto p-4 font-mono text-[12.5px] leading-[1.65]"
          style="background: var(--bg)"
        ><code>{{ serverCode }}</code></pre>
      </article>
    </div>

    <p class="mt-6 text-center text-sm" style="color: var(--fg-muted)">
      The page component
      <strong style="color: var(--fg)">imports the load type</strong>
      and Analog runs the loader on the server, hydrates it on the client.
    </p>
  `,
})
export class FullStackExample {
  protected readonly clientCode = CLIENT_CODE;
  protected readonly serverCode = SERVER_CODE;
}
