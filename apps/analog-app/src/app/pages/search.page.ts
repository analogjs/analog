import { Component, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { injectLoad, FormAction } from '@analogjs/router';

import type { load } from './search.server';

@Component({
  selector: 'analogjs-search-page',
  standalone: true,
  imports: [FormAction],
  template: `
    <section class="card card-border bg-base-100 shadow-xl">
      <div class="card-body gap-6">
        <div class="space-y-3">
          <div class="badge badge-info badge-outline">Search</div>
          <h1 class="card-title text-3xl">Query a route with URL params</h1>
        </div>

        <form
          class="join join-vertical w-full gap-4 lg:join-horizontal"
          method="get"
        >
          <input
            class="input join-item w-full lg:max-w-md"
            id="search"
            type="text"
            name="search"
            [value]="searchTerm()"
            placeholder="Search term"
          />
          <button class="btn btn-primary join-item" type="submit">
            Submit
          </button>
        </form>

        @if (searchTerm()) {
          <div role="status" class="alert alert-info alert-soft">
            <span>Search Term: {{ searchTerm() }}</span>
          </div>
        }
      </div>
    </section>
  `,
})
export default class NewsletterComponent {
  loader = toSignal(injectLoad<typeof load>(), { requireSync: true });
  searchTerm = computed(() => this.loader().searchTerm);
}
