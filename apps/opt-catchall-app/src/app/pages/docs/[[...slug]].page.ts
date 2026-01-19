import { Component, computed, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { injectContent } from '@analogjs/content';

@Component({
  selector: 'app-docs-optional-catchall-page',
  standalone: true,
  imports: [],
  template: `
    <h2>Page template</h2>
    @if (segments().length === 0) {
      <p>No extra segments. Try navigating to one of the links below.</p>
    } @else {
      <p>Segments: {{ segments().join(' / ') }}</p>
    }
  `,
})
export default class DocsOptionalCatchAllPageComponent {
  private readonly route = inject(ActivatedRoute);
  private paramMap = toSignal(this.route.paramMap, {
    initialValue: this.route.snapshot.paramMap,
  });
  readonly slug = computed(() => {
    return this.paramMap().get('slug') ?? '';
  });
  readonly segments = computed(() => this.slug().split('/').filter(Boolean));
}
