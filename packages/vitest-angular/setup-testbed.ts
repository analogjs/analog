import { EnvironmentProviders, NgModule, Provider, provideZonelessChangeDetection, Type } from '@angular/core';
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
  imports?: NgModule[];
  providers?: (Provider | EnvironmentProviders)[];
  browserMode?: boolean;
};

export function setupTestBed({
  zoneless = true,
  imports = [],
  providers = [],
  browserMode = false,
}: TestBedSetupOptions = {}) {
  beforeEach(getCleanupHook(false));
  afterEach(getCleanupHook(true));

  if (!(globalThis as any)[ANGULAR_TESTBED_SETUP]) {
    (globalThis as any)[ANGULAR_TESTBED_SETUP] = true;

    @NgModule({
      providers: zoneless ? [provideZonelessChangeDetection()] : [],
    })
    class ZonelessTestModule {}

    @NgModule({ providers })
    class CustomTestModule extends BrowserTestingModule {}

    getTestBed().initTestEnvironment(
      [
        CustomTestModule,
        ...(zoneless ? [ZonelessTestModule] : []),
        ...(imports || []),
      ],
      platformBrowserTesting(),
      browserMode ? { teardown: { destroyAfterEach: false } } : undefined,
    );
  }
}
