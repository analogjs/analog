import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Search } from './Search';
import { ThemeToggle } from './ThemeToggle';

@Component({
  selector: 'docs-header',
  imports: [RouterLink, Search, ThemeToggle],
  template: `
    <header class="flex items-center justify-between border-b px-6 py-3">
      <a routerLink="/" class="text-lg font-semibold">Analog</a>
      <div class="flex items-center gap-4 text-sm">
        <docs-search />
        <nav class="hidden gap-4 sm:flex">
          <a routerLink="/docs">Docs</a>
          <a
            href="https://github.com/analogjs/analog"
            target="_blank"
            rel="noopener"
            >GitHub</a
          >
        </nav>
        <docs-theme-toggle />
      </div>
    </header>
  `,
})
export class Header {}
