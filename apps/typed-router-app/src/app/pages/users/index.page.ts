import { injectRouteData, LinkTo } from '@analogjs/router';
import { Component } from '@angular/core';

import { USERS } from '../../data';

@Component({
  imports: [LinkTo],
  template: `
    <p id="users-section">Section: {{ data()['section'] }}</p>
    <ul id="user-list">
      @for (user of users; track user.id) {
        <li>
          <a
            [linkTo]="{ path: '/users/[userId]', params: { userId: user.id } }"
          >
            {{ user.name }}
          </a>
        </li>
      }
    </ul>
  `,
})
export default class UsersIndexPage {
  readonly users = USERS;
  // users.page.ts and this page share `/users`, so its route data is untyped.
  readonly data = injectRouteData();
}
