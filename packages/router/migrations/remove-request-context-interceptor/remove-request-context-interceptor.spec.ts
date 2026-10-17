import { HostTree, SchematicContext } from '@angular-devkit/schematics';
import { describe, expect, it } from 'vitest';

import removeRequestContextInterceptor from './remove-request-context-interceptor';

function migrate(config: string): string {
  const tree = new HostTree();
  tree.create('/src/app/app.config.ts', config);
  const context = {
    logger: { info: () => undefined, warn: () => undefined },
  } as unknown as SchematicContext;
  removeRequestContextInterceptor()(tree, context);
  return tree.readText('/src/app/app.config.ts');
}

describe('removeRequestContextInterceptor', () => {
  it('removes withInterceptors and its imports when it only held the interceptor', () => {
    const config = `import {
  provideHttpClient,
  withFetch,
  withInterceptors,
} from '@angular/common/http';
import { provideFileRouter, requestContextInterceptor } from '@analogjs/router';

export const appConfig = {
  providers: [
    provideFileRouter(),
    provideHttpClient(
      withFetch(),
      withInterceptors([requestContextInterceptor]),
    ),
  ],
};
`;

    expect(migrate(config)).toBe(`import {
  provideHttpClient,
  withFetch,
} from '@angular/common/http';
import { provideFileRouter } from '@analogjs/router';

export const appConfig = {
  providers: [
    provideFileRouter(),
    provideHttpClient(
      withFetch(),
    ),
  ],
};
`);
  });

  it('keeps other interceptors', () => {
    const config = `import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { requestContextInterceptor } from '@analogjs/router';
import { authInterceptor } from './auth';

export const providers = [
  provideHttpClient(withInterceptors([authInterceptor, requestContextInterceptor])),
];
`;

    expect(migrate(config))
      .toBe(`import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { authInterceptor } from './auth';

export const providers = [
  provideHttpClient(withInterceptors([authInterceptor])),
];
`);
  });

  it('leaves the import when the interceptor is used elsewhere', () => {
    const config = `import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { requestContextInterceptor } from '@analogjs/router';

export const providers = [provideHttpClient(withInterceptors([requestContextInterceptor]))];
export const interceptors = [requestContextInterceptor];
`;

    expect(migrate(config))
      .toBe(`import { provideHttpClient } from '@angular/common/http';
import { requestContextInterceptor } from '@analogjs/router';

export const providers = [provideHttpClient()];
export const interceptors = [requestContextInterceptor];
`);
  });
});
