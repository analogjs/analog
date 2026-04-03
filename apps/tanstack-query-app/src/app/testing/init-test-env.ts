import '@angular/compiler';
import { getTestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';

const INIT_KEY = Symbol.for('tq-test-env');

if (!(globalThis as any)[INIT_KEY]) {
  (globalThis as any)[INIT_KEY] = true;
  getTestBed().initTestEnvironment(
    BrowserTestingModule,
    platformBrowserTesting(),
  );
}
