import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-docs-index-page',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  template: `
    <h1>Docs Layout</h1>
    <nav style="display:flex; gap: 12px; padding: 8px 0">
      <a routerLink="/">Home</a>
      <a routerLink="/docs">Docs</a>
      <a routerLink="/docs/intro">Docs: Intro</a>
      <a routerLink="/docs/guide/getting-started">Docs: Getting Started</a>
      <a routerLink="/docs/reference/api/nested/path">Docs: Nested Path</a>
    </nav>
    <router-outlet />
  `,
})
export default class DocsIndexPageComponent {}
