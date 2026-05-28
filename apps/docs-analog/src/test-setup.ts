import '@analogjs/vitest-angular/setup-zone';
// Partial-compiled Angular libraries (e.g. PlatformNavigation) fall back
// to JIT under Vitest unless the Angular Linker processes them. Importing
// the compiler unlocks the JIT path so router-backed components compile
// during TestBed.createComponent.
import '@angular/compiler';

import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { getTestBed } from '@angular/core/testing';

getTestBed().initTestEnvironment(
  BrowserTestingModule,
  platformBrowserTesting(),
);

// jsdom doesn't ship these; stub them so components that rely on them
// (Toc's scroll-spy, ThemeToggle's system pref listener) can mount.
if (!('IntersectionObserver' in globalThis)) {
  class IntersectionObserverStub {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }
  (
    globalThis as unknown as { IntersectionObserver: unknown }
  ).IntersectionObserver = IntersectionObserverStub;
}
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
