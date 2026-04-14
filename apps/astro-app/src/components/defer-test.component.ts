import { Component } from '@angular/core';
import { CounterComponent } from './counter.component';

@Component({
  selector: 'astro-defer-test',
  imports: [CounterComponent],
  template: `
    @defer (on timer(1s)) {
      <astro-counter />
    } @placeholder {
      <p>Loading deferred component...</p>
    }
  `,
})
export class DeferTestComponent {}
