import { Injectable, inject, runInInjectionContext } from '@angular/core';
import { describe, expect, it } from 'vitest';

import { createServerFnAppInjector } from './app-injector';

@Injectable({ providedIn: 'root' })
class RootOnlyService {
  value() {
    return 'root';
  }
}

@Injectable()
class ListedService {
  value() {
    return 'listed';
  }
}

describe('createServerFnAppInjector', () => {
  it('resolves providedIn:root services without listing them', async () => {
    // The whole point of bootstrapping over `Injector.create`: a root injector
    // resolves tree-shakeable `providedIn: 'root'` services, so a handler
    // reached over HTTP sees them the same way it does during SSR.
    const injector = await createServerFnAppInjector();

    const resolved = runInInjectionContext(injector, () =>
      inject(RootOnlyService).value(),
    );

    expect(resolved).toBe('root');
  });

  it('also resolves explicitly listed providers', async () => {
    const injector = await createServerFnAppInjector([
      { provide: ListedService, useClass: ListedService, deps: [] },
    ]);

    const resolved = runInInjectionContext(injector, () =>
      inject(ListedService).value(),
    );

    expect(resolved).toBe('listed');
  });
});
