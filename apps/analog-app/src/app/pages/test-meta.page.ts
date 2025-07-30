import { Component } from '@angular/core';
import type { RouteMeta } from '@analogjs/router';

// Using RouteMeta type for proper type safety with Angular Route
export const routeMeta: RouteMeta = {
  title: 'Test Page with Meta',
  data: {
    description: 'This page demonstrates route metadata',
    requiresAuth: true,
    customData: {
      category: 'demo',
      priority: 'high',
    },
  },
  // Example of other valid Route properties
  canActivate: [],
  resolve: {},
};

@Component({
  selector: 'app-test-meta',
  standalone: true,
  template: `
    <div>
      <h1>Test Page with Route Meta</h1>
      <p>This page has custom route metadata exported using defineRouteMeta.</p>
      <p>The metadata follows Angular's Route interface structure.</p>
    </div>
  `,
})
export default class TestMetaPageComponent {}
