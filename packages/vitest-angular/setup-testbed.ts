import { NgModule, provideZonelessChangeDetection, Type } from '@angular/core';
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
  providers?: Type<any>[];
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
}: TestBedSetupOptions = {}) {
  beforeEach(getCleanupHook(false));
  afterEach(getCleanupHook(true));

  if (!(globalThis as any)[ANGULAR_TESTBED_SETUP]) {
    (globalThis as any)[ANGULAR_TESTBED_SETUP] = true;

    @NgModule({
      providers: zoneless ? [provideZonelessChangeDetection()] : [],
    })
    class ZonelessTestModule {}

    getTestBed().initTestEnvironment(
      [
        BrowserTestingModule,
        ...(zoneless ? [ZonelessTestModule] : []),
        ...((providers || []) as Type<any>[]),
      ],
      platformBrowserTesting(),
      {
        teardown: {
          ...(browserMode ? { destroyAfterEach: false } : undefined),
          ...teardown,
        },
      },
    );
  }
}
