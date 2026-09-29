import { injectRouteData, type RouteMeta } from '@analogjs/router';
import { Component } from '@angular/core';

export const routeMeta = {
  data: { widgets: ['traffic', 'errors'] },
} satisfies RouteMeta;

@Component({
  template: `
    <h2>Dashboard</h2>
    <p id="dashboard-inherited">
      Section: {{ data().section }}, auth required: {{ data().requiresAuth }}
    </p>
    <p id="dashboard-widgets">Widgets: {{ data().widgets.join(', ') }}</p>
  `,
})
export default class DashboardPage {
  readonly data = injectRouteData('/admin/dashboard');
}
