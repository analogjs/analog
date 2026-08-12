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
    redirectDocsRoot(() => {
      const locale = route.snapshot.paramMap.get('locale');
      return locale ? `/${locale}/docs` : null;
    });
  }
}
