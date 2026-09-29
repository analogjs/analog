import { injectNavigate, injectParams, LinkTo } from '@analogjs/router';
import { Component } from '@angular/core';

@Component({
  imports: [LinkTo],
  template: `
    <h1>Docs</h1>
    <p id="docs-slug">Segments: {{ params().slug.join(' / ') }}</p>
    <a
      id="link-docs-api"
      from="/docs/[...slug]"
      [linkTo]="{ path: '.', params: { slug: ['api', 'link-to'] } }"
      >API reference</a
    >
    <button
      id="btn-docs-guides"
      type="button"
      (click)="navigate('.', { params: { slug: ['guides', 'advanced'] } })"
    >
      Advanced guide
    </button>
  `,
})
export default class DocsPage {
  readonly params = injectParams('/docs/[...slug]');
  readonly navigate = injectNavigate('/docs/[...slug]');
}
