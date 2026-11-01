import { InjectionToken, inject } from '@angular/core';
import type { Type } from '@nestjs/common';
import type { ModuleRef } from '@nestjs/core';

let nestModuleRef: ModuleRef | undefined;

export function setNestApp(moduleRef: ModuleRef): void {
  nestModuleRef = moduleRef;
}

/** The running Nest application, available to server functions, loads and SSR. */
export const NEST_APP = new InjectionToken<ModuleRef>('NEST_APP', {
  providedIn: 'root',
  factory: () => {
    if (!nestModuleRef) {
      throw new Error('The Nest application is not initialized.');
    }
    return nestModuleRef;
  },
});

/** Resolves a Nest provider from inside an Angular injection context. */
export function injectNest<T>(token: Type<T> | string | symbol): T {
  return inject(NEST_APP).get(token, { strict: false });
}
