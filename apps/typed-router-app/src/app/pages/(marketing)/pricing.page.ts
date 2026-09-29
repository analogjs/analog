import { injectRouteData, type RouteMeta } from '@analogjs/router';
import { Component } from '@angular/core';

export const routeMeta = {
  data: { plans: ['free', 'team'] },
} satisfies RouteMeta;

@Component({
  template: `
    <h1>Pricing</h1>
    <p id="pricing-theme">Theme from the group layout: {{ data().theme }}</p>
    <ul id="pricing-plans">
      @for (plan of data().plans; track plan) {
        <li>{{ plan }}</li>
      }
    </ul>
  `,
})
export default class PricingPage {
  readonly data = injectRouteData('/pricing');
}
