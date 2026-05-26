import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'docs-header',
  standalone: true,
  imports: [RouterLink],
  template: `
    <header class="flex items-center justify-between border-b px-6 py-3">
      <a routerLink="/" class="text-lg font-semibold">Analog</a>
      <nav class="flex gap-4 text-sm">
        <a routerLink="/docs">Docs</a>
        <a
          href="https://github.com/analogjs/analog"
          target="_blank"
          rel="noopener"
          >GitHub</a
        >
      </nav>
    </header>
  `,
})
export class Header {}
