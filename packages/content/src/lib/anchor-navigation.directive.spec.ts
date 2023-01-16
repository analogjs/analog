import { Component, Directive, HostListener, inject } from '@angular/core';
import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { By } from '@angular/platform-browser';
import { Router } from '@angular/router';
import { expect, vi } from 'vitest';
import { AnchorNavigationDirective } from './anchor-navigation.directive';

describe('AnchorNavigationDirective', () => {
  it('ignores click on anchor elements that are out of scope', fakeAsync(() => {
    const { handleNavigation, selectById } = setup();

    selectById('out-of-scope-link').click();
    tick();

    expect(handleNavigation).not.toBeCalled();
  }));

  it('proceeds default behavior on non-anchor element click', fakeAsync(() => {
    const { router, handleNavigation, selectById } = setup();

    selectById('paragraph').click();
    tick();

    expect(handleNavigation.mock.results[0].value).toEqual(true);
    expect(router.navigateByUrl).not.toBeCalled();
  }));

  it('proceeds default navigation to external link', fakeAsync(() => {
    const { router, handleNavigation, selectById, navigationResult } = setup();

    selectById('external-link').click();
    tick();

    expect(handleNavigation.mock.results[0].value).toEqual(true);
    expect(router.navigateByUrl).not.toBeCalled();
    expect(navigationResult.navigatedTo).toBe('https://google.com/');
  }));

  it('proceeds default navigation to internal link with download', fakeAsync(() => {
    const { router, handleNavigation, selectById, navigationResult } = setup();

    selectById('link-with-download').click();
    tick();

    expect(handleNavigation.mock.results[0].value).toEqual(true);
    expect(router.navigateByUrl).not.toBeCalled();
    expect(navigationResult.navigatedTo).toBe('http://localhost:3000/link');
  }));

  it('proceeds default navigation to internal link with target blank', fakeAsync(() => {
    const { router, handleNavigation, selectById, navigationResult } = setup();

    selectById('link-with-target-blank').click();
    tick();

    expect(handleNavigation.mock.results[0].value).toEqual(true);
    expect(router.navigateByUrl).not.toBeCalled();
    expect(navigationResult.navigatedTo).toBe('http://localhost:3000/link');
  }));

  it('navigates to internal link with target self by using Angular router', fakeAsync(() => {
    const { router, handleNavigation, selectById } = setup();

    selectById('link-with-target-self').click();
    tick();

    expect(handleNavigation.mock.results[0].value).toEqual(false);
    expect(router.navigateByUrl).toBeCalledWith('/link');
  }));

  it('navigates to relative root link by using Angular router', fakeAsync(() => {
    const { router, handleNavigation, selectById } = setup();

    selectById('relative-root').click();
    tick();

    expect(handleNavigation.mock.results[0].value).toEqual(false);
    expect(router.navigateByUrl).toBeCalledWith('');
  }));

  it('navigates to absolute root link by using Angular router', fakeAsync(() => {
    const { router, handleNavigation, selectById } = setup();

    selectById('absolute-root').click();
    tick();

    expect(handleNavigation.mock.results[0].value).toEqual(false);
    expect(router.navigateByUrl).toBeCalledWith('');
  }));

  it('navigates to relative page link by using Angular router', fakeAsync(() => {
    const { router, handleNavigation, selectById } = setup();

    selectById('relative-page').click();
    tick();

    expect(handleNavigation.mock.results[0].value).toEqual(false);
    expect(router.navigateByUrl).toBeCalledWith('/page');
  }));

  it('navigates to absolute page link by using Angular router', fakeAsync(() => {
    const { router, handleNavigation, selectById } = setup();

    selectById('absolute-page').click();
    tick();

    expect(handleNavigation.mock.results[0].value).toEqual(false);
    expect(router.navigateByUrl).toBeCalledWith('/page');
  }));

  it('navigates to page link with search, hash, and trailing slash by using Angular router', fakeAsync(() => {
    const { router, handleNavigation, selectById } = setup();

    selectById('page-with-search-hash-and-trailing-slash').click();
    tick();

    expect(handleNavigation.mock.results[0].value).toEqual(false);
    expect(router.navigateByUrl).toBeCalledWith('/page?query=analog#section1');
  }));
});

function setup() {
  const navigationResult = { navigatedTo: '' };

  // JSDom doesn't provide support for navigation.
  // For more info see: https://github.com/jsdom/jsdom/issues/2112
  @Directive({
    selector: '[analogPreventRealNavigation]',
    standalone: true,
  })
  class PreventRealNavigationDirective {
    @HostListener('click', ['$event'])
    preventClick(event: Event) {
      if (event.target instanceof HTMLAnchorElement) {
        event.preventDefault();
        navigationResult.navigatedTo = event.target.href;
      }
    }
  }

  @Component({
    standalone: true,
    imports: [AnchorNavigationDirective],
    hostDirectives: [PreventRealNavigationDirective],
    template: `
      <a id="out-of-scope-link" href="https://github.com">Out of Scope Link</a>

      <div analogAnchorNavigation>
        <p id="paragraph">Paragraph</p>
        <a id="external-link" href="https://google.com">External Link</a>
        <a id="link-with-download" href="/link" download>
          Link with Download
        </a>
        <a id="link-with-target-blank" href="/link" target="_blank">
          Link with Target Blank
        </a>
        <a id="link-with-target-self" href="/link" target="_self">
          Link with Target Self
        </a>
        <a id="relative-root" href="/">Relative Root</a>
        <a id="absolute-root" href="{{ protocol }}//{{ host }}">
          Absolute Root
        </a>
        <a id="relative-page" href="../page">Relative Page</a>
        <a id="absolute-page" href="{{ protocol }}//{{ host }}/page">
          Absolute Page
        </a>
        <a
          id="page-with-search-hash-and-trailing-slash"
          href="./page/?query=analog#section1"
        >
          Page with Search, Hash, and Trailing Slash
        </a>
      </div>
    `,
  })
  class TestComponent {
    private readonly document = inject(DOCUMENT);

    readonly host = this.document.location.host;
    readonly protocol = this.document.location.protocol;
  }

  const fixture = TestBed.configureTestingModule({
    imports: [TestComponent],
    providers: [
      {
        provide: Router,
        useValue: { navigateByUrl: vi.fn() },
      },
    ],
  }).createComponent(TestComponent);
  fixture.detectChanges();

  const router = TestBed.inject(Router);
  const anchorNavigationDirective = fixture.debugElement
    .query(By.directive(AnchorNavigationDirective))
    .injector.get(AnchorNavigationDirective);
  const handleNavigation = vi.spyOn(
    anchorNavigationDirective,
    'handleNavigation'
  );

  function selectById(id: string): HTMLElement {
    return fixture.debugElement.query(By.css(`#${id}`)).nativeElement;
  }

  return {
    router,
    handleNavigation,
    selectById,
    navigationResult,
  };
}
