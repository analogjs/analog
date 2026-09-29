import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { DocsLayoutShell, redirectDocsRoot } from '../../docs';

@Component({
  imports: [DocsLayoutShell],
  template: `<docs-layout-shell />`,
})
export default class LocaleDocsLayoutPage {
  constructor() {
    const route = inject(ActivatedRoute);
    redirectDocsRoot(() => route.snapshot.paramMap.get('locale'));
  }
}
