import {
  injectNavigate,
  injectRouteData,
  LinkTo,
  type RouteMeta,
} from '@analogjs/router';
import { Component } from '@angular/core';

export const routeMeta = {
  data: { section: 'settings', role: 'owner' } as const,
} satisfies RouteMeta;

@Component({
  imports: [LinkTo],
  template: `
    <h2 id="settings-section">{{ data().section }}</h2>
    <p id="settings-role">
      Role: {{ data().role }}, auth required: {{ data().requiresAuth }}
    </p>
    <a id="link-settings-dashboard" from="/admin/settings" linkTo="../dashboard"
      >Dashboard</a
    >
    <button id="btn-settings-admin" type="button" (click)="navigate('..')">
      Admin home
    </button>
    <button
      id="btn-settings-user"
      type="button"
      (click)="navigate('/users/[userId]', { params: { userId: 1 } })"
    >
      User 1
    </button>
  `,
})
export default class SettingsPage {
  readonly data = injectRouteData('/admin/settings');
  readonly navigate = injectNavigate('/admin/settings');
}
