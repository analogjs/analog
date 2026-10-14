import { injectRouteData, LinkTo, type RouteMeta } from '@analogjs/router';
import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { of } from 'rxjs';

import { findTeam } from '../../../../data';

export const routeMeta = {
  data: { area: 'team' },
  resolve: {
    team: (route) =>
      of(findTeam(route.paramMap.get('orgId'), route.paramMap.get('teamId'))),
  },
} satisfies RouteMeta;

@Component({
  imports: [LinkTo, RouterOutlet],
  template: `
    <section id="members">
      <h2 id="team-name">
        {{ data().team?.name ?? 'Unknown team' }} in {{ data().org?.name }}
      </h2>
      <p id="team-area">Area: {{ data().area }}</p>
      <a
        id="link-team-members"
        from="/orgs/[orgId]/teams/[teamId]"
        linkTo="./members"
        >Members</a
      >
      <router-outlet />
    </section>
  `,
})
export default class TeamLayout {
  readonly data = injectRouteData('/orgs/[orgId]/teams/[teamId]');
}
