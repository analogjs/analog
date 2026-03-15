import { Component, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { injectLoad } from '@analogjs/router';

import type { load } from './search.server';

@Component({
  selector: 'analogjs-search-page',
  standalone: true,
  template: `
    <h3>Search</h3>

    <form method="get">
      <div>
        <label for="search"> Search </label>
        <input type="text" name="search" [value]="searchTerm()" />
      </div>

      <button class="button" type="submit">Submit</button>
    </form>

    @if (searchTerm()) {
      <p>Search Term: {{ searchTerm() }}</p>
    }
  `,
})
export default class NewsletterComponent {
  loader = toSignal(injectLoad<typeof load>(), { requireSync: true });
  searchTerm = computed(() => this.loader().searchTerm);
}
