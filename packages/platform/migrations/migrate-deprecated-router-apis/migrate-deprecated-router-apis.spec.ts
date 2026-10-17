import { describe, expect, it } from 'vitest';

import { migrateRouterSource } from './migrate-deprecated-router-apis';

describe('migrate-deprecated-router-apis', () => {
  it('replaces defineRouteMeta with a RouteMeta-typed object', () => {
    const result = migrateRouterSource(
      '/src/app/pages/index.page.ts',
      `import { defineRouteMeta, injectLoad } from '@analogjs/router';

export const routeMeta = defineRouteMeta({ title: 'Home' });
`,
    );

    expect(result)
      .toBe(`import { injectLoad, type RouteMeta } from '@analogjs/router';

export const routeMeta: RouteMeta = { title: 'Home' };
`);
  });

  it('replaces injectRouter and injectActivatedRoute with inject()', () => {
    const result = migrateRouterSource(
      '/src/app/pages/index.page.ts',
      `import { Component } from '@angular/core';
import { injectActivatedRoute, injectRouter } from '@analogjs/router';

@Component({ template: '' })
export default class HomePage {
  router = injectRouter();
  route = injectActivatedRoute();
}
`,
    );

    expect(result).toBe(`import { Component } from '@angular/core';
import { inject } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';

@Component({ template: '' })
export default class HomePage {
  router = inject(Router);
  route = inject(ActivatedRoute);
}
`);
  });

  it('ignores files without the removed APIs', () => {
    expect(
      migrateRouterSource(
        '/src/app/pages/index.page.ts',
        `import { injectLoad } from '@analogjs/router';`,
      ),
    ).toBeNull();
  });
});
