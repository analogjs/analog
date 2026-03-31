import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideLocationMocks } from '@angular/common/testing';
import { ROUTES, Router, provideRouter } from '@angular/router';
import { describe, expect, it } from 'vitest';

import { RouteExport } from './models';
import {
  ANALOG_EXTRA_ROUTE_FILE_SOURCES,
  ExtraRouteFileSource,
} from './route-files';
import { provideFileRouter } from './provide-file-router';

@Component({ standalone: true, template: '' })
class StubComponent {}

function stubModule(): Promise<RouteExport> {
  return Promise.resolve({ default: StubComponent });
}

describe('provideFileRouter integration', () => {
  it('should produce routes from extra file sources via DI', () => {
    const source: ExtraRouteFileSource = {
      files: {
        '/src/content/hello.md': () => stubModule(),
        '/src/content/docs/guide.md': () => stubModule(),
      },
      resolveModule: (_filename, fileLoader) =>
        fileLoader as () => Promise<RouteExport>,
    };

    TestBed.configureTestingModule({
      providers: [
        provideFileRouter(),
        provideLocationMocks(),
        {
          provide: ANALOG_EXTRA_ROUTE_FILE_SOURCES,
          multi: true,
          useValue: source,
        },
      ],
    });

    const allRoutes = TestBed.inject(ROUTES);
    // ROUTES is a multi-token — flatten all provided arrays
    const flatRoutes = allRoutes.flat();

    // Content routes should be present in the merged output
    const helloRoute = flatRoutes.find((r) => r.path === 'hello');
    const docsRoute = flatRoutes.find((r) => r.path === 'docs');

    expect(helloRoute).toBeDefined();
    expect(docsRoute).toBeDefined();
    expect(docsRoute!.children).toBeDefined();
    expect(docsRoute!.children![0].path).toBe('guide');
  });

  it('should produce empty routes when no extra sources and no page files', () => {
    // ANALOG_ROUTE_FILES is {} in the test environment (not replaced by Vite),
    // so with no extra sources the factory should produce an empty array.
    TestBed.configureTestingModule({
      providers: [provideFileRouter(), provideLocationMocks()],
    });

    const allRoutes = TestBed.inject(ROUTES);
    const flatRoutes = allRoutes.flat();

    expect(flatRoutes).toEqual([]);
  });

  it('should merge extra sources with correct route ordering', () => {
    const source: ExtraRouteFileSource = {
      files: {
        '/src/content/blog/[slug].md': () => stubModule(),
        '/src/content/blog/about.md': () => stubModule(),
        '/src/content/blog/[...not-found].md': () => stubModule(),
      },
      resolveModule: (_filename, fileLoader) =>
        fileLoader as () => Promise<RouteExport>,
    };

    TestBed.configureTestingModule({
      providers: [
        provideFileRouter(),
        provideLocationMocks(),
        {
          provide: ANALOG_EXTRA_ROUTE_FILE_SOURCES,
          multi: true,
          useValue: source,
        },
      ],
    });

    const allRoutes = TestBed.inject(ROUTES);
    const flatRoutes = allRoutes.flat();
    const blogRoute = flatRoutes.find((r) => r.path === 'blog');

    expect(blogRoute).toBeDefined();
    expect(blogRoute!.children!.map((c) => c.path)).toEqual([
      'about', // static first
      ':slug', // dynamic second
      '**', // catchall last
    ]);
  });

  it('should allow withExtraRoutes to take priority over file routes', () => {
    const source: ExtraRouteFileSource = {
      files: {
        '/src/content/hello.md': () => stubModule(),
      },
      resolveModule: (_filename, fileLoader) =>
        fileLoader as () => Promise<RouteExport>,
    };

    TestBed.configureTestingModule({
      providers: [
        provideFileRouter(
          // withExtraRoutes is registered before the factory,
          // so its routes appear first in the ROUTES array
          {
            ɵkind: 100 as number,
            ɵproviders: [
              {
                provide: ROUTES,
                useValue: [{ path: 'custom', component: StubComponent }],
                multi: true,
              },
            ],
          },
        ),
        provideLocationMocks(),
        {
          provide: ANALOG_EXTRA_ROUTE_FILE_SOURCES,
          multi: true,
          useValue: source,
        },
      ],
    });

    const allRoutes = TestBed.inject(ROUTES);
    // allRoutes is array-of-arrays from multi-provider
    // withExtraRoutes should appear before file routes
    const firstBatch = allRoutes[0];
    const customRoute = firstBatch?.find?.(
      (r: { path: string }) => r.path === 'custom',
    );

    expect(customRoute).toBeDefined();
  });
});
