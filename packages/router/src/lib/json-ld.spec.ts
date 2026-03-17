import { DOCUMENT } from '@angular/common';
import { provideLocationMocks } from '@angular/common/testing';
import { Component, ENVIRONMENT_INITIALIZER } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Route, Router, RouterOutlet, provideRouter } from '@angular/router';
import { map, timer } from 'rxjs';

import {
  ROUTE_JSON_LD_KEY,
  isJsonLdObject,
  normalizeJsonLd,
  serializeJsonLd,
  updateJsonLdOnRouteChange,
} from './json-ld';

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

  it('escapes HTML-sensitive characters in serialized JSON-LD', () => {
    const serialized = serializeJsonLd({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: '</script><script>alert("xss")</script>',
    });

    expect(serialized).toContain('\\u003c/script\\u003e');
    expect(serialized).not.toContain('</script><script>');
    expect(serialized && JSON.parse(serialized)).toEqual({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: '</script><script>alert("xss")</script>',
    });
  });

  it('removes all JSON-LD scripts when navigating to a route without JSON-LD', async () => {
    const { getJsonLdScripts, router } = setup();

    await router.navigateByUrl('/');
    expect(getJsonLdScripts()).toHaveLength(1);

    // Navigate to a child that has NO JSON-LD — but parent still has it,
    // so let's create a dedicated setup for a truly empty route.
    @Component({
      standalone: true,
      imports: [RouterOutlet],
      template: '<router-outlet></router-outlet>',
    })
    class ShellComponent {}

    @Component({ standalone: true, template: '<p>No JSON-LD</p>' })
    class EmptyComponent {}

    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'AnalogJS',
    };

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: 'with-ld',
            component: EmptyComponent,
            data: { [ROUTE_JSON_LD_KEY]: [jsonLd] },
          },
          {
            path: 'without-ld',
            component: EmptyComponent,
          },
        ]),
        provideLocationMocks(),
        {
          provide: ENVIRONMENT_INITIALIZER,
          multi: true,
          useValue: () => updateJsonLdOnRouteChange(),
        },
      ],
    });

    const r = TestBed.inject(Router);
    const doc = TestBed.inject(DOCUMENT);
    const getScripts = () =>
      Array.from(
        doc.querySelectorAll(
          'script[type="application/ld+json"][data-analog-json-ld]',
        ),
      ) as HTMLScriptElement[];

    await r.navigateByUrl('/with-ld');
    expect(getScripts()).toHaveLength(1);

    await r.navigateByUrl('/without-ld');
    expect(getScripts()).toHaveLength(0);
  });

  it('handles Graph-based JSON-LD documents', async () => {
    const graph = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', name: 'AnalogJS' },
        { '@type': 'Organization', name: 'Analog Inc' },
      ],
    };

    @Component({
      standalone: true,
      imports: [RouterOutlet],
      template: '<router-outlet></router-outlet>',
    })
    class ShellComponent {}

    @Component({ standalone: true, template: '<p>Graph</p>' })
    class GraphComponent {}

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: '',
            component: GraphComponent,
            data: { [ROUTE_JSON_LD_KEY]: [graph] },
          },
        ]),
        provideLocationMocks(),
        {
          provide: ENVIRONMENT_INITIALIZER,
          multi: true,
          useValue: () => updateJsonLdOnRouteChange(),
        },
      ],
    });

    const r = TestBed.inject(Router);
    const doc = TestBed.inject(DOCUMENT);
    const getScripts = () =>
      Array.from(
        doc.querySelectorAll(
          'script[type="application/ld+json"][data-analog-json-ld]',
        ),
      ) as HTMLScriptElement[];

    await r.navigateByUrl('/');
    const scripts = getScripts();
    expect(scripts).toHaveLength(1);

    const parsed = JSON.parse(scripts[0].textContent || '');
    expect(parsed['@graph']).toHaveLength(2);
    expect(parsed['@graph'][0]['@type']).toBe('WebSite');
    expect(parsed['@graph'][1]['@type']).toBe('Organization');
  });

  it('sets correct data-analog-json-ld-index attributes on multiple entries', async () => {
    const entries = [
      { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Site' },
      { '@context': 'https://schema.org', '@type': 'WebPage', name: 'Page' },
      {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name: 'Org',
      },
    ];

    @Component({
      standalone: true,
      imports: [RouterOutlet],
      template: '<router-outlet></router-outlet>',
    })
    class ShellComponent {}

    @Component({ standalone: true, template: '<p>Multi</p>' })
    class MultiComponent {}

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: '',
            component: MultiComponent,
            data: { [ROUTE_JSON_LD_KEY]: entries },
          },
        ]),
        provideLocationMocks(),
        {
          provide: ENVIRONMENT_INITIALIZER,
          multi: true,
          useValue: () => updateJsonLdOnRouteChange(),
        },
      ],
    });

    const r = TestBed.inject(Router);
    const doc = TestBed.inject(DOCUMENT);

    await r.navigateByUrl('/');

    const scripts = Array.from(
      doc.querySelectorAll(
        'script[type="application/ld+json"][data-analog-json-ld]',
      ),
    ) as HTMLScriptElement[];

    expect(scripts).toHaveLength(3);
    expect(scripts[0].getAttribute('data-analog-json-ld-index')).toBe('0');
    expect(scripts[1].getAttribute('data-analog-json-ld-index')).toBe('1');
    expect(scripts[2].getAttribute('data-analog-json-ld-index')).toBe('2');
  });

  it('skips invalid JSON-LD entries that cannot be serialized', async () => {
    const circular = {
      '@context': 'https://schema.org',
      '@type': 'Thing',
    } as Record<string, unknown>;
    circular.self = circular;

    @Component({
      standalone: true,
      imports: [RouterOutlet],
      template: '<router-outlet></router-outlet>',
    })
    class TestComponent {}

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          {
            path: '',
            component: TestComponent,
            data: {
              [ROUTE_JSON_LD_KEY]: [circular],
            },
          },
        ]),
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

    await router.navigateByUrl('/');

    expect(
      document.querySelectorAll(
        'script[type="application/ld+json"][data-analog-json-ld]',
      ),
    ).toHaveLength(0);
  });
});

describe('serializeJsonLd', () => {
  it('serializes a Graph-based JSON-LD document', () => {
    const graph = {
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebSite', name: 'AnalogJS' },
        { '@type': 'Organization', name: 'Analog Inc' },
      ],
    };

    const serialized = serializeJsonLd(graph);
    expect(serialized).toBeTruthy();

    const parsed = JSON.parse(serialized!);
    expect(parsed['@graph']).toHaveLength(2);
    expect(parsed['@context']).toBe('https://schema.org');
  });

  it('returns null for unserializable input', () => {
    const circular = {} as Record<string, unknown>;
    circular.self = circular;
    expect(serializeJsonLd(circular)).toBeNull();
  });
});

describe('normalizeJsonLd', () => {
  it('wraps a single object in an array', () => {
    const obj = { '@context': 'https://schema.org', '@type': 'WebSite' };
    expect(normalizeJsonLd(obj)).toEqual([obj]);
  });

  it('filters non-objects from an array', () => {
    const valid = { '@context': 'https://schema.org', '@type': 'WebPage' };
    const result = normalizeJsonLd([valid, null, 'string', 42, undefined]);
    expect(result).toEqual([valid]);
  });

  it('returns empty array for null', () => {
    expect(normalizeJsonLd(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(normalizeJsonLd(undefined)).toEqual([]);
  });

  it('returns empty array for a primitive', () => {
    expect(normalizeJsonLd('not-an-object')).toEqual([]);
    expect(normalizeJsonLd(123)).toEqual([]);
    expect(normalizeJsonLd(true)).toEqual([]);
  });

  it('returns empty array for a nested array (arrays are not JSON-LD objects)', () => {
    expect(normalizeJsonLd([[{ '@type': 'Thing' }]])).toEqual([]);
  });
});

describe('isJsonLdObject', () => {
  it('returns true for a plain object', () => {
    expect(isJsonLdObject({ '@type': 'Thing' })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isJsonLdObject(null)).toBe(false);
  });

  it('returns false for an array', () => {
    expect(isJsonLdObject([{ '@type': 'Thing' }])).toBe(false);
  });

  it('returns false for primitives', () => {
    expect(isJsonLdObject('string')).toBe(false);
    expect(isJsonLdObject(42)).toBe(false);
    expect(isJsonLdObject(undefined)).toBe(false);
  });
});
