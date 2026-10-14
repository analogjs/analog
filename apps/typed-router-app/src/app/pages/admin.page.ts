import { injectRouteData, LinkTo, type RouteMeta } from '@analogjs/router';
import { Component } from '@angular/core';
import { RouterLinkActive, RouterOutlet } from '@angular/router';

export const routeMeta = {
  data: { section: 'admin', requiresAuth: true },
  resolve: {
    permissions: () => Promise.resolve(['users:read', 'settings:write']),
  },
} satisfies RouteMeta;

@Component({
  imports: [LinkTo, RouterLinkActive, RouterOutlet],
  template: `
    <div id="admin-layout">
      <h1 id="admin-section">{{ data().section }}</h1>
      <p id="admin-permissions">
        Permissions: {{ data().permissions.join(', ') }}
      </p>
      <nav>
        <a
          id="admin-link-dashboard"
          from="/admin"
          linkTo="./dashboard"
          routerLinkActive="active"
          >Dashboard</a
        >
        <a
          id="admin-link-settings"
          from="/admin"
          linkTo="./settings"
          routerLinkActive="active"
          >Settings</a
        >
        <a id="admin-link-home" from="/admin" linkTo="..">Home</a>
      </nav>
      <router-outlet />
    </div>
  `,
})
export default class AdminLayout {
  readonly data = injectRouteData('/admin');
}
