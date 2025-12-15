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
  browserMode?: boolean;
};

export function setupTestBed(
  options: TestBedSetupOptions = { zoneless: true, providers: [] },
) {
  beforeEach(getCleanupHook(false));
  afterEach(getCleanupHook(true));

  if (!(globalThis as any)[ANGULAR_TESTBED_SETUP]) {
    (globalThis as any)[ANGULAR_TESTBED_SETUP] = true;

    @NgModule({
      providers: options?.zoneless ? [provideZonelessChangeDetection()] : [],
    })
    class ZonelessTestModule {}

    getTestBed().initTestEnvironment(
      [
        BrowserTestingModule,
        ...(options?.zoneless ? [ZonelessTestModule] : []),
        ...((options?.providers || []) as Type<any>[]),
      ],
      platformBrowserTesting(),
      options?.browserMode
        ? { teardown: { destroyAfterEach: false } }
        : undefined,
    );
  }
}
