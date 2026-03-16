import { Component, computed, effect, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { contentFileResource } from '@analogjs/content/resources';
import { JsonPipe } from '@angular/common';
import { MarkdownComponent } from '@analogjs/content';
import { map } from 'rxjs';
@Component({
  selector: 'app-docs-optional-catchall-page',
  standalone: true,

  template: `
    <h2>Page template</h2>
    <p>Segments: {{ slug() }}</p>
    @let page = source.value();
    @if (page) {
      <pre>{{ page | json }}</pre>
      <ul>
        @for (item of page.toc; track item) {
          <li>
            <a href="#{{ item.id }}">{{ item.text }}</a>
          </li>
        }
      </ul>
      <analog-markdown [content]="page.content"></analog-markdown>
    }
  `,
  imports: [MarkdownComponent, JsonPipe],
})
export default class DocsOptionalCatchAllPageComponent {
  slug = toSignal(
    inject(ActivatedRoute).paramMap.pipe(
      map((params) => params.get('slug') as string),
    ),
    { requireSync: true },
  );

  params = computed(() => ({ customFilename: `docs/${this.slug()}` }));
  readonly source = contentFileResource(this.params);
}
