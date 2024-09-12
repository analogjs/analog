import { Component } from '@angular/core';
import { injectActivatedRoute } from '@analogjs/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

import { FormAction } from './form-action.directive';

@Component({
  selector: 'app-search-page',
  standalone: true,
  imports: [FormAction],
  template: `
    <h3>Search</h3>

    <form method="get">
      <div>
        <label for="search"> Search </label>
        <input type="text" name="search" />
      </div>

      <button class="button" type="submit">Submit</button>
    </form>

    @if(searchTerm()) {
    <p>Search Term: {{ searchTerm() }}</p>
    }
  `,
})
export default class NewsletterComponent {
  route = injectActivatedRoute();
  searchTerm = toSignal(
    this.route.queryParamMap.pipe(map((params) => params.get('search')))
  );
}
