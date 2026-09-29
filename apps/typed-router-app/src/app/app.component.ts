import { LinkTo } from '@analogjs/router';
import { Component } from '@angular/core';
import { RouterLinkActive, RouterOutlet } from '@angular/router';

@Component({
  selector: 'app-root',
  imports: [LinkTo, RouterLinkActive, RouterOutlet],
  template: `
    <nav>
      <a
        id="nav-home"
        linkTo="/"
        routerLinkActive="active"
        [routerLinkActiveOptions]="{ exact: true }"
        ariaCurrentWhenActive="page"
        >Home</a
      >
      <a id="nav-about" linkTo="/about" routerLinkActive="active">About</a>
      <a id="nav-pricing" linkTo="/pricing" routerLinkActive="active"
        >Pricing</a
      >
      <a id="nav-users" linkTo="/users" routerLinkActive="active">Users</a>
      <a
        id="nav-org"
        [linkTo]="{ path: '/orgs/[orgId]', params: { orgId: 'analogjs' } }"
        routerLinkActive="active"
        >Org</a
      >
      <a
        id="nav-docs"
        [linkTo]="{
          path: '/docs/[...slug]',
          params: { slug: ['getting-started'] },
        }"
        routerLinkActive="active"
        >Docs</a
      >
      <a
        id="nav-files"
        [linkTo]="{ path: '/files/[[...path]]' }"
        routerLinkActive="active"
        >Files</a
      >
      <a id="nav-search" linkTo="/search" routerLinkActive="active">Search</a>
      <a id="nav-admin" linkTo="/admin" routerLinkActive="active">Admin</a>
    </nav>

    <main>
      <router-outlet />
    </main>
  `,
})
export class AppComponent {}
