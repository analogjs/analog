import {
  injectNavigate,
  injectParams,
  injectRouteData,
  LinkTo,
  type RouteMeta,
} from '@analogjs/router';
import { Component, computed } from '@angular/core';

export const routeMeta = {
  data: { kind: 'post' },
} satisfies RouteMeta;

@Component({
  imports: [LinkTo],
  template: `
    <h1 id="post-heading">
      User {{ params().userId }}, post {{ params().postId }}
    </h1>
    <p id="post-kind">Kind: {{ data().kind }}</p>
    <a id="link-post-user" from="/users/[userId]/posts/[postId]" linkTo="../.."
      >Back to user</a
    >
    <button
      id="btn-next-post"
      type="button"
      (click)="navigate('.', { params: { postId: nextPostId() } })"
    >
      Next post
    </button>
  `,
})
export default class UserPostPage {
  readonly params = injectParams('/users/[userId]/posts/[postId]');
  // Dot notation is not nested under users.page.ts, so no users layout data.
  readonly data = injectRouteData('/users/[userId]/posts/[postId]');
  readonly navigate = injectNavigate('/users/[userId]/posts/[postId]');
  readonly nextPostId = computed(() => Number(this.params().postId) + 1);
}
