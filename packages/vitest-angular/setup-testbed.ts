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
  teardown?: {
    destroyAfterEach: boolean;
  };
  errorOnUnknownElements?: boolean;
  errorOnUnknownProperties?: boolean;
};

export function setupTestBed({
  zoneless = true,
  providers = [],
  teardown,
  errorOnUnknownElements,
  errorOnUnknownProperties,
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
          destroyAfterEach: true,
          ...teardown,
        },
        errorOnUnknownElements,
        errorOnUnknownProperties,
      },
    );
  }
}
