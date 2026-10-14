import { injectRouteData, LinkTo, type RouteMeta } from '@analogjs/router';
import { Component } from '@angular/core';
import { RouterLinkActive, RouterOutlet } from '@angular/router';

import { findOrg } from '../../data';

export const routeMeta = {
  resolve: { org: (route) => findOrg(route.paramMap.get('orgId')) },
} satisfies RouteMeta;

@Component({
  imports: [LinkTo, RouterLinkActive, RouterOutlet],
  template: `
    <h1 id="org-name">{{ data().org?.name ?? 'Unknown org' }}</h1>
    <p id="org-load">
      Teams from the layout's server load: {{ data().load.teamCount }}
    </p>
    <nav id="org-teams">
      @for (team of data().org?.teams ?? []; track team.id) {
        <a
          from="/orgs/[orgId]"
          [linkTo]="{ path: './teams/[teamId]', params: { teamId: team.id } }"
          routerLinkActive="active"
          >{{ team.name }}</a
        >
      }
    </nav>
    <router-outlet />
  `,
})
export default class OrgLayout {
  readonly data = injectRouteData('/orgs/[orgId]');
}
