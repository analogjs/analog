import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import {
  provideRouter,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { describe, expect, it, vi } from 'vitest';

import { RoutePathOptionsBase } from './to-route';

// Use the packaged directive so signal input metadata is compiled by Angular.
const { LinkTo } =
  await vi.importActual<typeof import('./link-to.directive')>(
    '@analogjs/router',
  );

@Component({ standalone: true, template: '' })
class Page {}

@Component({
  standalone: true,
  imports: [LinkTo, RouterLinkActive, RouterOutlet],
  template: `
    <nav routerLinkActive="parent-active">
      <a
        [linkTo]="$any(destination())"
        routerLinkActive="active"
        [target]="target()"
        [replaceUrl]="true"
        [state]="{ source: 'link' }"
      >
        User
      </a>
    </nav>
    <router-outlet />
  `,
})
class Host {
  // Runtime fixtures have no generated table; consumer tests check the input type.
  readonly destination = signal<
    string | ({ path: string } & RoutePathOptionsBase) | null | undefined
  >({ path: '/users/[id]', params: { id: 'one' } });
  readonly target = signal('_self');
}

function setup() {
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [
      provideRouter([
        { path: 'users/:id', component: Page },
        { path: 'about', component: Page },
      ]),
    ],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const anchor: HTMLAnchorElement = fixture.nativeElement.querySelector('a');
  const nav: HTMLElement = fixture.nativeElement.querySelector('nav');
  const link = fixture.debugElement.query(By.directive(LinkTo));
  return {
    fixture,
    anchor,
    nav,
    routerLink: link.injector.get(RouterLink),
    router: TestBed.inject(Router),
  };
}

describe('LinkTo', () => {
  it('navigates to static strings and clears previous query and fragment values', async () => {
    const { fixture, anchor, nav, router } = setup();
    fixture.componentInstance.destination.set({
      path: '/users/[id]',
      params: { id: 'one' },
      query: { tab: 'details' },
      hash: 'bio',
    });
    fixture.detectChanges();
    expect(anchor.getAttribute('href')).toBe('/users/one?tab=details#bio');

    fixture.componentInstance.destination.set('/about');
    fixture.detectChanges();
    expect(anchor.getAttribute('href')).toBe('/about');
    anchor.click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(router.url).toBe('/about');
    expect(anchor.classList.contains('active')).toBe(true);
    expect(nav.classList.contains('parent-active')).toBe(true);

    fixture.componentInstance.destination.set(null);
    fixture.detectChanges();
    expect(anchor.hasAttribute('href')).toBe(false);
  });

  it.each([
    ['a/b', '/users/a%2Fb?tab=a%20b#details'],
    [0, '/users/0?tab=a%20b#details'],
  ])(
    'builds hrefs and delegates navigation for param %s',
    async (id, expectedUrl) => {
      const { fixture, anchor, router } = setup();
      fixture.componentInstance.destination.set({
        path: '/users/[id]',
        params: { id },
        query: { tab: 'a b' },
        hash: 'details',
      });
      fixture.detectChanges();
      expect(anchor.getAttribute('href')).toBe(expectedUrl);
      const navigate = vi.spyOn(router, 'navigateByUrl');
      anchor.click();
      await fixture.whenStable();
      expect(router.url).toBe(expectedUrl);
      expect(navigate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          replaceUrl: true,
          state: { source: 'link' },
        }),
      );
    },
  );

  it('updates active classes on the link and its ancestor when params change', async () => {
    const { fixture, anchor, nav, router } = setup();
    await router.navigateByUrl('/users/one');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(anchor.classList.contains('active')).toBe(true);
    expect(nav.classList.contains('parent-active')).toBe(true);

    fixture.componentInstance.destination.set({
      path: '/users/[id]',
      params: { id: 'two' },
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(anchor.getAttribute('href')).toBe('/users/two');
    expect(anchor.classList.contains('active')).toBe(false);
    expect(nav.classList.contains('parent-active')).toBe(false);

    fixture.componentInstance.destination.set({
      path: '/users/[id]',
      params: { id: 'one' },
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(nav.classList.contains('parent-active')).toBe(true);
  });

  it('clears query and fragment and supports disabling and re-enabling links', () => {
    const { fixture, anchor, routerLink } = setup();
    fixture.componentInstance.destination.set({
      path: '/users/[id]',
      params: { id: 'one' },
      query: { tab: 'details' },
      hash: 'bio',
    });
    fixture.detectChanges();
    expect(anchor.getAttribute('href')).toBe('/users/one?tab=details#bio');
    for (const value of [null, undefined]) {
      fixture.componentInstance.destination.set(value);
      fixture.detectChanges();
      expect(anchor.hasAttribute('href')).toBe(false);
      expect(routerLink.urlTree).toBeNull();
      fixture.componentInstance.destination.set({
        path: '/users/[id]',
        params: { id: 'two' },
      });
      fixture.detectChanges();
      expect(anchor.getAttribute('href')).toBe('/users/two');
    }
  });

  it('updates active classes when only the query changes', async () => {
    const { fixture, anchor, nav, router } = setup();
    await router.navigateByUrl('/users/one?tab=details');
    for (const tab of ['details', 'settings', 'details']) {
      fixture.componentInstance.destination.set({
        path: '/users/[id]',
        params: { id: 'one' },
        query: { tab },
      });
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(anchor.getAttribute('href')).toBe(`/users/one?tab=${tab}`);
      expect(anchor.classList.contains('active')).toBe(tab === 'details');
      expect(nav.classList.contains('parent-active')).toBe(tab === 'details');
    }
  });

  it('preserves native handling of modifier clicks and non-self targets', () => {
    const { fixture, router, routerLink, anchor } = setup();
    const navigate = vi.spyOn(router, 'navigateByUrl');
    expect(routerLink.onClick(0, true, false, false, false)).toBe(true);
    expect(routerLink.onClick(1, false, false, false, false)).toBe(true);
    fixture.componentInstance.target.set('_blank');
    fixture.detectChanges();
    expect(anchor.getAttribute('target')).toBe('_blank');
    expect(routerLink.onClick(0, false, false, false, false)).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });
});
