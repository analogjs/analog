import {
  injectNavigate,
  injectParams,
  injectQuery,
  injectRouteData,
  LinkTo,
  type RouteMeta,
} from '@analogjs/router';
import { Component, computed } from '@angular/core';

export const routeMeta = {
  data: { area: 'member' },
} satisfies RouteMeta;

@Component({
  imports: [LinkTo],
  template: `
    <article id="member">
      <h3 id="member-name">{{ member()?.name ?? 'Unknown member' }}</h3>
      <p id="member-context">
        {{ data().org?.name }} / {{ data().team?.name }} / area:
        {{ data().area }}
      </p>
      <p id="member-view">View: {{ query()['view'] ?? 'full' }}</p>
      <section id="projects">
        <h4>Projects from the server load</h4>
        <ul>
          @for (project of data().load.projects; track project) {
            <li>{{ project }}</li>
          }
        </ul>
      </section>
      <nav>
        <a
          id="link-member-list"
          from="/orgs/[orgId]/teams/[teamId]/members/[memberId]"
          linkTo=".."
          >All members</a
        >
        <a
          id="link-member-team"
          from="/orgs/[orgId]/teams/[teamId]/members/[memberId]"
          linkTo="../.."
          >Team</a
        >
        <a
          id="link-member-org"
          from="/orgs/[orgId]/teams/[teamId]/members/[memberId]"
          linkTo="../../../.."
          >Org</a
        >
        <a
          id="link-member-docs-team"
          from="/orgs/[orgId]/teams/[teamId]/members/[memberId]"
          [linkTo]="{
            path: '/orgs/[orgId]/teams/[teamId]',
            params: { teamId: 'docs' },
          }"
          >Docs team (orgId from the current route)</a
        >
      </nav>
      <button
        id="btn-next-member"
        type="button"
        (click)="
          navigate('.', {
            params: { memberId: nextMemberId() },
            query: { view: 'compact' },
          })
        "
      >
        Next member
      </button>
    </article>
  `,
})
export default class MemberPage {
  readonly params = injectParams(
    '/orgs/[orgId]/teams/[teamId]/members/[memberId]',
  );
  readonly query = injectQuery(
    '/orgs/[orgId]/teams/[teamId]/members/[memberId]',
  );
  readonly data = injectRouteData(
    '/orgs/[orgId]/teams/[teamId]/members/[memberId]',
  );
  readonly navigate = injectNavigate(
    '/orgs/[orgId]/teams/[teamId]/members/[memberId]',
  );
  readonly member = computed(() =>
    this.data().team?.members.find(
      (member) => member.id === this.params().memberId,
    ),
  );
  readonly nextMemberId = computed(() => Number(this.params().memberId) + 1);
}
