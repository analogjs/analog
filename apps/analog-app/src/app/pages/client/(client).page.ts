import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { type RouteMeta } from '@analogjs/router';

export const routeMeta: RouteMeta = {
  title: 'Client Component',
  jsonLd: {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    identifier: 'analog-client',
    name: 'Analog Client Only Page',
  },
};

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2>Client Component</h2>

    <p id="client-message">
      This route renders entirely on the client and updates without SSR.
    </p>

    <p>Current count: {{ count() }}</p>

    <p>
      <button (click)="update()">Update</button>
    </p>
  `,
})
export default class ClientComponent {
  readonly count = signal(0);

  update() {
    this.count.update((value) => value + 1);
  }
}
