import { TestBed } from '@angular/core/testing';
import { NavigationEnd, provideRouter, Router } from '@angular/router';
import { filter, firstValueFrom } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { ANALOG_DOCS_CONFIG, type DocsConfig } from '../config';
import { redirectDocsRoot } from '../docs-layout';
import { docsLink } from '../routes';
import { DocFooter } from './doc-footer';
import { Header } from './header';
import { Sidebar } from './sidebar';

const config: DocsConfig = {
  brand: { name: 'Docs', logoSrc: '' },
  locales: {
    default: 'en',
    list: [
      { code: 'en', label: 'English' },
      { code: 'de', label: 'Deutsch' },
    ],
  },
  headerNav: [{ label: 'Introduction', linkTo: docsLink('introduction') }],
  sidebar: [
    { kind: 'doc', id: 'introduction', label: 'Introduction' },
    { kind: 'doc', id: 'guides/routing', label: 'Routing' },
    { kind: 'doc', id: 'guides/forms', label: 'Forms' },
  ],
};

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideRouter([{ path: '**', children: [] }]),
      { provide: ANALOG_DOCS_CONFIG, useValue: config },
    ],
  });
  return TestBed.inject(Router);
}

describe('typed docs navigation', () => {
  it('updates header, sidebar, and previous/next links when the locale changes', async () => {
    const router = setup();
    const header = TestBed.createComponent(Header);
    const sidebar = TestBed.createComponent(Sidebar);
    const footer = TestBed.createComponent(DocFooter);
    footer.componentRef.setInput('slug', 'guides/routing');

    for (const prefix of ['', '/de', '']) {
      await router.navigateByUrl(`${prefix}/docs/guides/routing`);
      header.detectChanges();
      sidebar.detectChanges();
      footer.detectChanges();

      expect(
        header.nativeElement.querySelector('nav a').getAttribute('href'),
      ).toBe(`${prefix}/docs/introduction`);
      expect(
        Array.from(
          sidebar.nativeElement.querySelectorAll('a'),
          (a: HTMLAnchorElement) => a.getAttribute('href'),
        ),
      ).toEqual([
        `${prefix}/docs/introduction`,
        `${prefix}/docs/guides/routing`,
        `${prefix}/docs/guides/forms`,
      ]);
      expect(
        Array.from(
          footer.nativeElement.querySelectorAll('a'),
          (a: HTMLAnchorElement) => a.getAttribute('href'),
        ),
      ).toEqual([`${prefix}/docs/introduction`, `${prefix}/docs/guides/forms`]);
    }
  });

  it.each([null, 'de'])(
    'redirects the docs root for locale %s',
    async (locale) => {
      const router = setup();
      const base = locale ? `/${locale}/docs` : '/docs';
      await router.navigateByUrl(base);
      const redirected = firstValueFrom(
        router.events.pipe(filter((event) => event instanceof NavigationEnd)),
      );
      TestBed.runInInjectionContext(() => redirectDocsRoot(() => locale));
      await redirected;
      expect(router.url).toBe(`${base}/introduction`);
    },
  );
});
