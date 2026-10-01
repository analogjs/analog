import { injectRouteData, LinkTo } from '@analogjs/router';
import { Component } from '@angular/core';

@Component({
  imports: [LinkTo],
  template: `
    <ul id="member-list">
      @for (member of data().team?.members ?? []; track member.id) {
        <li>
          <a
            from="/orgs/[orgId]/teams/[teamId]/members"
            [linkTo]="{ path: './[memberId]', params: { memberId: member.id } }"
            >{{ member.name }}</a
          >
        </li>
      }
    </ul>
  `,
})
export default class MembersPage {
  readonly data = injectRouteData('/orgs/[orgId]/teams/[teamId]/members');
}
