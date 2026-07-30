import { Component } from '@angular/core';
import { DocsLayoutShell, redirectDocsRoot } from '../docs';

@Component({
  imports: [DocsLayoutShell],
  template: `<docs-layout-shell />`,
})
export default class DocsLayoutPage {
  constructor() {
    redirectDocsRoot(() => '/docs');
  }
}
