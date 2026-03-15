import { DOCUMENT } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { Component, ENVIRONMENT_INITIALIZER } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Route, Router, RouterOutlet, provideRouter } from '@angular/router';
import { map, timer } from 'rxjs';

import { ROUTE_JSON_LD_KEY, updateJsonLdOnRouteChange } from './json-ld';

describe('updateJsonLdOnRouteChange', () => {
  function setup() {
    @Component({
      standalone: true,
      imports: [RouterOutlet],
      template: '<router-outlet></router-outlet>',
    })
    class TestComponent {}

    const parentJsonLd = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'AnalogJS',
    };

    const childJsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: 'JSON-LD with Analog',
    };

    const routes: Route[] = [
      {
        path: '',
        component: TestComponent,
        data: {
          [ROUTE_JSON_LD_KEY]: [parentJsonLd],
        },
        children: [
          {
            path: 'child',
            component: TestComponent,
            resolve: {
              [ROUTE_JSON_LD_KEY]: () =>
                timer(10).pipe(map(() => [childJsonLd])),
            },
          },
        ],
      },
    ];

    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideLocationMocks(),
        {
          provide: ENVIRONMENT_INITIALIZER,
          multi: true,
          useValue: () => updateJsonLdOnRouteChange(),
        },
      ],
    });

    const router = TestBed.inject(Router);
    const document = TestBed.inject(DOCUMENT);

    const getJsonLdScripts = () =>
      Array.from(
        document.querySelectorAll(
          'script[type="application/ld+json"][data-analog-json-ld]',
        ),
      ) as HTMLScriptElement[];

    return { childJsonLd, document, getJsonLdScripts, parentJsonLd, router };
  }

  it('adds JSON-LD script tags on initial navigation', async () => {
    const { getJsonLdScripts, parentJsonLd, router } = setup();

    await router.navigateByUrl('/');

    const scripts = getJsonLdScripts();
    expect(scripts).toHaveLength(1);
    expect(JSON.parse(scripts[0].textContent || '')).toEqual(parentJsonLd);
  });

  it('replaces stale JSON-LD on route changes', async () => {
    const { childJsonLd, getJsonLdScripts, parentJsonLd, router } = setup();

    await router.navigateByUrl('/');
    expect(JSON.parse(getJsonLdScripts()[0].textContent || '')).toEqual(
      parentJsonLd,
    );

    await router.navigateByUrl('/child');
    const childScripts = getJsonLdScripts();
    expect(childScripts).toHaveLength(2);
    expect(JSON.parse(childScripts[0].textContent || '')).toEqual(parentJsonLd);
    expect(JSON.parse(childScripts[1].textContent || '')).toEqual(childJsonLd);

    await router.navigateByUrl('/');
    const finalScripts = getJsonLdScripts();
    expect(finalScripts).toHaveLength(1);
    expect(JSON.parse(finalScripts[0].textContent || '')).toEqual(parentJsonLd);
  });
});
