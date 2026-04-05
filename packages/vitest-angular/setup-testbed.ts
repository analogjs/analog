import {
  EnvironmentProviders,
  NgModule,
  Provider,
  provideZonelessChangeDetection,
} from '@angular/core';
import {
  ɵgetCleanupHook as getCleanupHook,
  getTestBed,
} from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { afterEach, beforeEach } from 'vitest';

const ANGULAR_TESTBED_SETUP = Symbol.for('testbed-setup');

function getDebugScopes(): string[] {
  const envDebug =
    typeof process !== 'undefined' ? process.env['DEBUG'] : undefined;

  let localStorageDebug: string | null | undefined;

  try {
    localStorageDebug =
      'localStorage' in globalThis
        ? globalThis.localStorage?.getItem('debug')
        : null;
  } catch {
    localStorageDebug = null;
  }

  return [envDebug, localStorageDebug]
    .filter((value): value is string => !!value)
    .flatMap((value) =>
      value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean),
    );
}

function isDebugEnabled(namespace: string): boolean {
  return getDebugScopes().some(
    (scope) =>
      scope === '*' ||
      scope === namespace ||
      (scope.endsWith('*') && namespace.startsWith(scope.slice(0, -1))),
  );
}

function createScopedDebug(namespace: string) {
  return (...args: unknown[]): void => {
    if (!isDebugEnabled(namespace)) return;
    console.debug(`[${namespace}]`, ...args);
  };
}

const debugTestBed = createScopedDebug('analog:vitest:testbed');
const debugTestBedV = createScopedDebug('analog:vitest:testbed:v');

type TestBedSetupOptions = {
  zoneless?: boolean;
  providers?: (Provider | EnvironmentProviders)[];
  /**
   * @deprecated Use `teardown.destroyAfterEach` instead.
   * @sunset 3.0.0
   */
  browserMode?: boolean;
  teardown?: {
    destroyAfterEach: boolean;
  };
};

export function setupTestBed({
  zoneless = true,
  providers = [],
  browserMode = false,
  teardown,
}: TestBedSetupOptions = {}): void {
  beforeEach(getCleanupHook(false));
  afterEach(getCleanupHook(true));

  const testBed = getTestBed();
  const destroyAfterEach = teardown?.destroyAfterEach ?? !browserMode;

  debugTestBedV('setupTestBed()', {
    zoneless,
    browserMode,
    providerCount: providers.length,
    destroyAfterEach,
    reconfigure: !!(globalThis as any)[ANGULAR_TESTBED_SETUP],
  });

  if ((globalThis as any)[ANGULAR_TESTBED_SETUP]) {
    debugTestBed('resetting Angular test environment before reconfigure');
    testBed.resetTestingModule();
    testBed.resetTestEnvironment();
  } else {
    debugTestBed('initializing Angular test environment');
  }

  (globalThis as any)[ANGULAR_TESTBED_SETUP] = true;

  @NgModule({
    providers: [
      ...(zoneless ? [provideZonelessChangeDetection()] : []),
      ...providers,
    ],
  })
  class TestModule {}

  testBed.initTestEnvironment(
    [BrowserTestingModule, TestModule],
    platformBrowserTesting(),
    {
      teardown: {
        ...{ destroyAfterEach },
        ...teardown,
      },
    },
  );

  debugTestBed('Angular test environment ready');
}
