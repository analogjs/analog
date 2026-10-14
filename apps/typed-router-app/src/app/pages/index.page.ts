import { injectNavigate, LinkTo, toRoute } from '@analogjs/router';
import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  imports: [LinkTo, RouterLink],
  template: `
    <h1>Typed router test app</h1>

    <section id="static-links">
      <h2>Static routes</h2>
      <a id="link-about" linkTo="/about">About</a>
      <a id="link-about-hash" [linkTo]="{ path: '/about', hash: 'details' }"
        >About details</a
      >
      <a id="link-pricing" linkTo="/pricing">Pricing (route group)</a>
      <a id="link-files-root" [linkTo]="{ path: '/files/[[...path]]' }"
        >Files (optional catch-all omitted)</a
      >
    </section>

    <section id="dynamic-links">
      <h2>Dynamic params</h2>
      <a
        id="link-user-1"
        [linkTo]="{ path: '/users/[userId]', params: { userId: 1 } }"
        >User 1</a
      >
      <a
        id="link-user-2-activity"
        [linkTo]="{
          path: '/users/[userId]',
          params: { userId: '2' },
          query: { tab: 'activity' },
        }"
        >User 2 activity</a
      >
      <a
        id="link-post"
        [linkTo]="{
          path: '/users/[userId]/posts/[postId]',
          params: { userId: 1, postId: 2 },
        }"
        >User 1, post 2 (dot notation)</a
      >
      <a
        id="link-member"
        [linkTo]="{
          path: '/orgs/[orgId]/teams/[teamId]/members/[memberId]',
          params: { orgId: 'analogjs', teamId: 'core', memberId: 1 },
          query: { view: 'compact' },
          hash: 'projects',
        }"
        >Member in nested layouts</a
      >
    </section>

    <section id="catch-all-links">
      <h2>Catch-all params</h2>
      <a
        id="link-docs"
        [linkTo]="{
          path: '/docs/[...slug]',
          params: { slug: ['guides', 'typed routing'] },
        }"
        >Docs (encoded segment)</a
      >
      <a
        id="link-files"
        [linkTo]="{
          path: '/files/[[...path]]',
          params: { path: ['src', 'app'] },
        }"
        >Files in src/app</a
      >
    </section>

    <section id="query-links">
      <h2>Query params</h2>
      <a
        id="link-search"
        [linkTo]="{
          path: '/search',
          query: { q: 'signals', tag: ['router', 'forms'] },
        }"
        >Search with repeated params</a
      >
    </section>

    <section id="conditional-links">
      <h2>Disabled and non-anchor links</h2>
      <a id="link-conditional" [linkTo]="linksEnabled() ? '/about' : null">
        {{ linksEnabled() ? 'About (enabled)' : 'About (disabled)' }}
      </a>
      <button
        id="btn-toggle-links"
        type="button"
        (click)="linksEnabled.set(!linksEnabled())"
      >
        Toggle link
      </button>
      <button id="btn-link-search" type="button" linkTo="/search">
        Search (button)
      </button>
    </section>

    <section id="to-route">
      <h2>toRoute with RouterLink</h2>
      <a
        id="link-to-route"
        [routerLink]="teamRoute.path"
        [queryParams]="teamRoute.queryParams"
        [fragment]="teamRoute.fragment"
        >Core team</a
      >
    </section>

    <section id="programmatic">
      <h2>injectNavigate</h2>
      <button
        id="btn-nav-user"
        type="button"
        (click)="navigate('/users/[userId]', { params: { userId: 3 } })"
      >
        User 3
      </button>
      <button
        id="btn-nav-search"
        type="button"
        (click)="
          navigate('/search', { query: { q: 'analog' } }, { replaceUrl: true })
        "
      >
        Search (replaceUrl)
      </button>
      <button id="btn-nav-member" type="button" (click)="goToDocsMember()">
        Docs team member (state)
      </button>
    </section>
  `,
})
export default class HomePage {
  readonly navigate = injectNavigate();
  readonly linksEnabled = signal(true);
  readonly teamRoute = toRoute('/orgs/[orgId]/teams/[teamId]', {
    params: { orgId: 'analogjs', teamId: 'core' },
    hash: 'members',
  });

  goToDocsMember() {
    return this.navigate(
      '/orgs/[orgId]/teams/[teamId]/members/[memberId]',
      { params: { orgId: 'analogjs', teamId: 'docs', memberId: 3 } },
      { state: { from: 'home' } },
    );
  }
}
