import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LocalePicker } from './LocalePicker';
import { Search } from './Search';
import { ThemeToggle } from './ThemeToggle';

@Component({
  selector: 'docs-header',
  imports: [LocalePicker, RouterLink, Search, ThemeToggle],
  template: `
    <header
      class="flex items-center justify-between border-b px-6 py-3"
      style="border-color: var(--border)"
    >
      <a routerLink="/" class="flex items-center gap-2 text-lg font-semibold">
        <img
          src="/img/logos/analog-logo.svg"
          alt=""
          width="32"
          height="32"
          class="inline-block"
        />
        Analog
      </a>
      <div class="flex items-center gap-4 text-sm">
        <docs-search />
        <nav class="hidden gap-4 sm:flex">
          <a routerLink="/docs">Docs</a>
          <a routerLink="/docs/support">Support</a>
          <a
            href="https://github.com/analogjs/analog"
            target="_blank"
            rel="noopener"
            >GitHub</a
          >
          <a href="https://chat.analogjs.org" target="_blank" rel="noopener"
            >Discord</a
          >
        </nav>
        <docs-locale-picker />
        <docs-theme-toggle />
      </div>
    </header>
  `,
})
export class Header {}
