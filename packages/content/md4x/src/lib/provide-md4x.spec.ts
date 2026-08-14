import { TestBed } from '@angular/core/testing';
import { describe, it, expect } from 'vitest';

import { ContentRenderer } from '../../../src/lib/content-renderer';
import { provideContent } from '../../../src/lib/provide-content';
import { CONTENT_FILE_LOADER } from '../../../src/lib/content-file-loader';
import { CONTENT_LIST_LOADER } from '../../../src/lib/content-list-loader';
import { MDC_COMPONENTS, withMdcComponents } from '../../../mdc/src/index';
import {
  Md4xContentRendererService,
  MD4X_RENDERER_OPTIONS,
} from './md4x-content-renderer.service';
import { Md4xWasmContentRendererService } from './md4x-wasm-content-renderer.service';
import { withMd4xRenderer, withMd4xWasmRenderer } from './provide-md4x';

describe('md4x provider wiring', () => {
  describe('withMd4xRenderer', () => {
    it('provides Md4xContentRendererService as ContentRenderer', () => {
      TestBed.configureTestingModule({
        providers: [provideContent(withMd4xRenderer())],
      });

      const renderer = TestBed.inject(ContentRenderer);
      expect(renderer).toBeInstanceOf(Md4xContentRendererService);
    });

    it('provides content file and list loaders', () => {
      TestBed.configureTestingModule({
        providers: [provideContent(withMd4xRenderer())],
      });

      expect(() => TestBed.inject(CONTENT_FILE_LOADER)).not.toThrow();
      expect(() => TestBed.inject(CONTENT_LIST_LOADER)).not.toThrow();
    });

    it('provides renderer options when specified', () => {
      const opts = { heal: true };
      TestBed.configureTestingModule({
        providers: [provideContent(withMd4xRenderer(opts))],
      });

      const injected = TestBed.inject(MD4X_RENDERER_OPTIONS);
      expect(injected).toEqual({ heal: true });
    });

    it('does not provide options token when no options given', () => {
      TestBed.configureTestingModule({
        providers: [provideContent(withMd4xRenderer())],
      });

      const injected = TestBed.inject(MD4X_RENDERER_OPTIONS, null);
      expect(injected).toBeNull();
    });
  });

  describe('withMd4xWasmRenderer', () => {
    it('provides Md4xWasmContentRendererService as ContentRenderer', () => {
      TestBed.configureTestingModule({
        providers: [provideContent(withMd4xWasmRenderer())],
      });

      const renderer = TestBed.inject(ContentRenderer);
      expect(renderer).toBeInstanceOf(Md4xWasmContentRendererService);
    });

    it('provides content file and list loaders', () => {
      TestBed.configureTestingModule({
        providers: [provideContent(withMd4xWasmRenderer())],
      });

      expect(() => TestBed.inject(CONTENT_FILE_LOADER)).not.toThrow();
      expect(() => TestBed.inject(CONTENT_LIST_LOADER)).not.toThrow();
    });

    it('provides renderer options when specified', () => {
      TestBed.configureTestingModule({
        providers: [provideContent(withMd4xWasmRenderer({ heal: true }))],
      });

      const injected = TestBed.inject(MD4X_RENDERER_OPTIONS);
      expect(injected).toEqual({ heal: true });
    });
  });

  describe('withMdcComponents', () => {
    it('populates MDC_COMPONENTS injection token', () => {
      const registry = {
        alert: () => Promise.resolve(class MockAlert {}),
      };

      TestBed.configureTestingModule({
        providers: [withMdcComponents(registry as any)],
      });

      const components = TestBed.inject(MDC_COMPONENTS);
      expect(components).toBeInstanceOf(Map);
      expect(components.has('alert')).toBe(true);
    });

    it('provides empty map for empty registry', () => {
      TestBed.configureTestingModule({
        providers: [withMdcComponents({})],
      });

      const components = TestBed.inject(MDC_COMPONENTS);
      expect(components.size).toBe(0);
    });

    it('composes with withMd4xRenderer', () => {
      TestBed.configureTestingModule({
        providers: [
          provideContent(
            withMd4xRenderer(),
            withMdcComponents({
              card: () => Promise.resolve(class MockCard {}),
            } as any),
          ),
        ],
      });

      const renderer = TestBed.inject(ContentRenderer);
      const components = TestBed.inject(MDC_COMPONENTS);

      expect(renderer).toBeInstanceOf(Md4xContentRendererService);
      expect(components.has('card')).toBe(true);
    });
  });
});
