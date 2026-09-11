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
        [linkTo]="$any(commands())"
        [queryParams]="query()"
        [fragment]="fragment()"
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
  readonly commands = signal<
    string | readonly (string | number)[] | null | undefined
  >(['/users', 'one']);
  readonly query = signal<Record<string, unknown> | null>(null);
  readonly fragment = signal<string | undefined>(undefined);
  readonly target = signal('_self');
}

function setup() {
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [
      provideRouter([
        { path: 'users/:id', component: Page },
        { path: 'about', component: Page },
        { path: 'docs', children: [{ path: '**', component: Page }] },
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
  it.each([
    ['a/b', '/users/a%2Fb?tab=a%20b#details'],
    [0, '/users/0?tab=a%20b#details'],
  ])(
    'builds hrefs and delegates navigation for param %s',
    async (id, expectedUrl) => {
      const { fixture, anchor, router } = setup();
      fixture.componentInstance.commands.set(['/users', id]);
      fixture.componentInstance.query.set({ tab: 'a b' });
      fixture.componentInstance.fragment.set('details');
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

    fixture.componentInstance.commands.set(['/users', 'two']);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(anchor.getAttribute('href')).toBe('/users/two');
    expect(anchor.classList.contains('active')).toBe(false);
    expect(nav.classList.contains('parent-active')).toBe(false);

    fixture.componentInstance.commands.set(['/users', 'one']);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(nav.classList.contains('parent-active')).toBe(true);
    fixture.componentInstance.query.set({ tab: 'details' });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(anchor.classList.contains('active')).toBe(false);
    expect(nav.classList.contains('parent-active')).toBe(false);
  });

  it('updates query and fragment independently and supports disabling links', () => {
    const { fixture, anchor, routerLink } = setup();
    fixture.componentInstance.query.set({ tab: 'details' });
    fixture.componentInstance.fragment.set('bio');
    fixture.detectChanges();
    expect(anchor.getAttribute('href')).toBe('/users/one?tab=details#bio');
    for (const value of [null, undefined]) {
      fixture.componentInstance.commands.set(value);
      fixture.detectChanges();
      expect(anchor.hasAttribute('href')).toBe(false);
      expect(routerLink.urlTree).toBeNull();
      fixture.componentInstance.commands.set(['/users', 'two']);
      fixture.detectChanges();
      expect(anchor.getAttribute('href')).toBe('/users/two?tab=details#bio');
    }
    fixture.componentInstance.query.set(null);
    fixture.componentInstance.fragment.set(undefined);
    fixture.detectChanges();
    expect(anchor.getAttribute('href')).toBe('/users/two');
  });

  it.each([
    ['/about', '/about'],
    [['/', 'users', 'a/b'], '/users/a%2Fb'],
    [['/docs', 'a/b', 42], '/docs/a%2Fb/42'],
  ] as const)(
    'delegates absolute command forms %j to Angular',
    async (commands, expectedUrl) => {
      const { fixture, anchor, router } = setup();
      fixture.componentInstance.commands.set(commands);
      fixture.detectChanges();
      expect(anchor.getAttribute('href')).toBe(expectedUrl);
      anchor.click();
      await fixture.whenStable();
      expect(router.url).toBe(expectedUrl);
    },
  );

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
