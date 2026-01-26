import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { contentFileResource } from '@analogjs/content/resources';
import { JsonPipe } from '@angular/common';
import { MarkdownComponent } from '@analogjs/content';

@Component({
  selector: 'app-docs-optional-catchall-page',
  standalone: true,

  template: `
    <h2>Page template</h2>
    <p>Segments: {{ slug() }}</p>
    <p>Filepath: {{ filePath() }}</p>
    @let page = source.value();
    @if (page) {
      <pre>{{ page | json }}</pre>
      <analog-markdown [content]="page.content"></analog-markdown>
    }
  `,
  imports: [MarkdownComponent, JsonPipe],
})
export default class DocsOptionalCatchAllPageComponent {
  private readonly route = inject(ActivatedRoute);
  private paramMap = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });

  readonly slug = computed(() => this.paramMap().get('slug') ?? '');
  readonly filePath = computed(() => 'docs/' + this.slug());
  readonly source = contentFileResource(this.filePath);
}
