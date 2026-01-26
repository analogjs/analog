import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { injectContent, MarkdownComponent } from '@analogjs/content';
import { AsyncPipe } from '@angular/common';

@Component({
  selector: 'app-docs-optional-catchall-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <ul>
      <li><a routerLink="/docs">Docs (base)</a></li>
      <li><a routerLink="/docs/intro">Docs /intro</a></li>
      <li>
        <a routerLink="/docs/guide/getting-started"
          >Docs /guide/getting-started</a
        >
      </li>
      <li>
        <a routerLink="/docs/reference/api/nested/path"
          >Docs /reference/api/nested/path</a
        >
      </li>
    </ul>
  `,
})
export default class DocsIndexPageComponent {}
