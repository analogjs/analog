import { injectNavigate, injectQuery, LinkTo } from '@analogjs/router';
import { Component, computed } from '@angular/core';

@Component({
  imports: [LinkTo],
  template: `
    <h1>Search</h1>
    <p id="search-q">q: {{ query()['q'] ?? 'none' }}</p>
    <p id="search-tags">tags: {{ tags().join(', ') || 'none' }}</p>
    <p id="search-page">page: {{ page() }}</p>
    <p id="search-archived">archived: {{ query()['archived'] ?? 'false' }}</p>
    <a
      id="link-next-page"
      [linkTo]="{ path: '/search', query: { page: page() + 1 } }"
      queryParamsHandling="merge"
      >Next page (keeps other params)</a
    >
    <a
      id="link-archived"
      [linkTo]="{ path: '/search', query: { archived: true } }"
      queryParamsHandling="merge"
      >Include archived</a
    >
    <a id="link-clear" linkTo="/search">Clear</a>
    <button id="btn-next-page" type="button" (click)="nextPageFromQuery()">
      Next page (query updater)
    </button>
    <button id="btn-clear-tags" type="button" (click)="clearTags()">
      Clear tags (merge, keeps the fragment)
    </button>
  `,
})
export default class SearchPage {
  readonly query = injectQuery('/search');
  readonly navigate = injectNavigate('/search');
  readonly tags = computed(() => {
    const tag = this.query()['tag'];
    return Array.isArray(tag) ? tag : tag ? [tag] : [];
  });
  readonly page = computed(() => Number(this.query()['page'] ?? 1));

  nextPageFromQuery() {
    return this.navigate('.', {
      query: (prev) => ({ ...prev, page: Number(prev['page'] ?? 1) + 1 }),
    });
  }

  clearTags() {
    return this.navigate(
      '.',
      { query: { tag: null } },
      { queryParamsHandling: 'merge', preserveFragment: true },
    );
  }
}
