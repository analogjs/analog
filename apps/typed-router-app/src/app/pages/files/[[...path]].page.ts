import { injectParams, LinkTo } from '@analogjs/router';
import { Component, computed } from '@angular/core';

@Component({
  imports: [LinkTo],
  template: `
    <h1>Files</h1>
    <p id="files-path">Path: /{{ segments().join('/') }}</p>
    <a
      id="link-files-parent"
      from="/files/[[...path]]"
      [linkTo]="{ path: '.', params: { path: segments().slice(0, -1) } }"
      >Parent folder</a
    >
    <a
      id="link-files-assets"
      from="/files/[[...path]]"
      [linkTo]="{ path: '.', params: { path: ['src', 'assets'] } }"
      >src/assets</a
    >
  `,
})
export default class FilesPage {
  readonly params = injectParams('/files/[[...path]]');
  readonly segments = computed(() => this.params().path ?? []);
}
