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

  if (!(globalThis as any)[ANGULAR_TESTBED_SETUP]) {
    (globalThis as any)[ANGULAR_TESTBED_SETUP] = true;

    @NgModule({
      providers: [
        ...(zoneless ? [provideZonelessChangeDetection()] : []),
        ...providers,
      ],
    })
    class TestModule {}

    getTestBed().initTestEnvironment(
      [BrowserTestingModule, TestModule],
      platformBrowserTesting(),
      {
        teardown: {
          ...{ destroyAfterEach: !browserMode },
          ...teardown,
        },
      },
    );
  }
}
