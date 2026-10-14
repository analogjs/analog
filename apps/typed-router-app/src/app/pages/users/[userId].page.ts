import {
  injectLoad,
  injectNavigate,
  injectParams,
  injectQuery,
  injectResources,
  injectRouteData,
  LinkTo,
  type RouteMeta,
} from '@analogjs/router';
import { Component, computed, resource } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';

import { findUser } from '../../data';

export const routeMeta = {
  resolve: {
    profile: async (route) => findUser(route.paramMap.get('userId')),
  },
  resources: (ctx) => ({
    userResource: resource({
      params: ctx.params,
      loader: async ({ params }) => findUser(params['userId']),
    }),
  }),
} satisfies RouteMeta;

@Component({
  imports: [LinkTo],
  template: `
    <h2 id="user-name">{{ data().profile?.name ?? 'Unknown user' }}</h2>
    <p id="user-section">Section from the users layout: {{ data().section }}</p>
    <p id="user-directory">Users in directory: {{ data().directory.length }}</p>
    <p id="user-tab">Tab: {{ query()['tab'] ?? 'profile' }}</p>
    <p id="user-load">
      Server load: {{ data().load.postCount }} posts, rendered at
      {{ load().renderedAt }}
    </p>
    <p id="user-resource">
      Resource: {{ resources.userResource.value()?.name ?? 'None' }}
    </p>

    <nav id="user-links">
      <a id="link-user-list" from="/users/[userId]" linkTo="..">All users</a>
      <a
        id="link-user-activity"
        from="/users/[userId]"
        [linkTo]="{ path: '.', query: { tab: 'activity' } }"
        >Activity</a
      >
      <a
        id="link-user-next"
        from="/users/[userId]"
        [linkTo]="{ path: '.', params: { userId: nextId() } }"
        >Next user</a
      >
      <a
        id="link-user-post"
        from="/users/[userId]"
        [linkTo]="{ path: './posts/[postId]', params: { postId: 1 } }"
        >First post</a
      >
    </nav>

    <button id="btn-user-next" type="button" (click)="nextUser()">
      Next user (params updater)
    </button>
    <button id="btn-user-list" type="button" (click)="navigate('..')">
      All users (injectNavigate)
    </button>
  `,
})
export default class UserPage {
  readonly params = injectParams('/users/[userId]');
  readonly query = injectQuery('/users/[userId]');
  readonly data = injectRouteData('/users/[userId]');
  readonly resources = injectResources('/users/[userId]');
  readonly load = toSignal(injectLoad('/users/[userId]'), {
    requireSync: true,
  });
  readonly navigate = injectNavigate('/users/[userId]');
  readonly nextId = computed(() => Number(this.params().userId) + 1);

  nextUser() {
    return this.navigate('.', {
      params: (prev) => ({ userId: Number(prev.userId) + 1 }),
    });
  }
}
