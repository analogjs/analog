import '@analogjs/vite-plugin-angular/setup-vitest';
import '@angular/compiler';

/**
 * Initialize TestBed for all tests inside of content
 */
import { TestBed } from '@angular/core/testing';
import {
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting,
} from '@angular/platform-browser-dynamic/testing';

TestBed.initTestEnvironment(
  BrowserDynamicTestingModule,
  platformBrowserDynamicTesting(),
);

// jsdom doesn't ship these; docs/ui components (ThemeToggle's
// prefers-color-scheme listener, Toc's scroll-spy) need them to mount.
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
