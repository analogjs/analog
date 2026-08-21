import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StaticPageSeo } from '../seo';

@Component({
  imports: [RouterLink],
  template: `
    <main class="mx-auto max-w-3xl px-6 py-16">
      <h1 class="text-4xl font-bold tracking-tight">About Analog</h1>
      <div class="mt-6 space-y-4 leading-7" style="color: var(--fg-muted)">
        <p>
          Analog (also written AnalogJS) is the fullstack meta-framework for
          building applications and websites with
          <a class="link" href="https://angular.dev">Angular</a>. It brings
          file-based routing, server-side rendering (SSR), static site
          generation (SSG), API routes, and Markdown content support to Angular,
          powered by <a class="link" href="https://vitejs.dev">Vite</a> and
          <a class="link" href="https://nitro.build">Nitro</a>.
        </p>
        <p>
          The project was created by Brandon Roberts and is developed in the
          open by a community of contributors. All source code is MIT-licensed
          and lives in the
          <a class="link" href="https://github.com/analogjs/analog"
            >analogjs/analog</a
          >
          monorepo on GitHub, which also publishes the
          <code>&#64;analogjs/*</code> packages and the
          <code>create-analog</code> CLI to npm.
        </p>
        <p>
          Analog's development is funded by its
          <a class="link" routerLink="/docs/sponsoring">sponsors and partners</a
          >. This documentation site is itself built with Analog and deployed as
          a fully prerendered static site — the source is in the same
          repository.
        </p>
        <p>
          Want to get involved? Read the
          <a class="link" routerLink="/docs/contributing">contribution guide</a
          >, browse the
          <a class="link" routerLink="/docs/introduction">documentation</a>, or
          say hello on
          <a class="link" href="https://chat.analogjs.org">Discord</a>. For
          machine-readable resources and APIs, see the
          <a class="link" routerLink="/developers">developer portal</a>.
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
export default class AboutPage {
  constructor() {
    inject(StaticPageSeo).apply(
      '/about',
      'About',
      'Analog is the MIT-licensed fullstack meta-framework for Angular, created by Brandon Roberts and developed in the open by its community.',
    );
  }
}
