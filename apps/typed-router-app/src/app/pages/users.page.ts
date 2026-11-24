import type { RouteMeta } from '@analogjs/router';
import { Component, resource } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { of } from 'rxjs';

import { USERS } from '../data';

export const routeMeta = {
  data: { section: 'users' },
  resolve: {
    directory: () => of(USERS.map(({ id, name }) => ({ id, name }))),
  },
  resources: () => ({
    directoryResource: resource({
      loader: async () => USERS.map(({ id, name }) => ({ id, name })),
    }),
  }),
} satisfies RouteMeta;

@Component({
  imports: [RouterOutlet],
  template: `
    <div id="users-layout">
      <h1>Users</h1>
      <router-outlet />
    </div>
  `,
})
export default class UsersLayout {}
