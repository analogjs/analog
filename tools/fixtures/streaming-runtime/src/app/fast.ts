import { Component, inject } from '@angular/core';
import { PROBE_ID } from './probe';

@Component({
  selector: 'fixture-fast',
  standalone: true,
  template: '<p data-fast>fast-{{ id }}</p>',
})
export class FastPanel {
  readonly id = inject(PROBE_ID);
}
