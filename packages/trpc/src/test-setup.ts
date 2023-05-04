import '@analogjs/vite-plugin-angular/setup-vitest';
import '@angular/compiler';

/**
 * Initialize TestBed for all tests inside of router
 */
import { TestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';

TestBed.initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting()
);
