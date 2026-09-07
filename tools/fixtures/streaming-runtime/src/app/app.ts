import { Component } from '@angular/core';
import { FastPanel } from './fast';
import { SlowPanel } from './slow';

@Component({
  selector: 'fixture-root',
  standalone: true,
  imports: [FastPanel, SlowPanel],
  template: `
    <h1>Streaming runtime fixture</h1>
    @defer (hydrate on immediate) {
      <fixture-fast />
    } @placeholder {
      <p>Fast panel pending</p>
    }
    @defer (hydrate on immediate) {
      <fixture-slow />
    } @placeholder {
      <p>Slow panel pending</p>
    }
  `,
})
export class App {}
