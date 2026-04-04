import { Component } from '@angular/core';
import { DeferredComponent } from './deferred.component';

@Component({
  selector: 'astro-defer-test',
  imports: [DeferredComponent],
  template: `
    @defer (on timer(1s)) {
      <astro-deferred />
    } @placeholder {
      <p>Loading deferred component...</p>
    }
  `,
})
export class DeferTestComponent {}
