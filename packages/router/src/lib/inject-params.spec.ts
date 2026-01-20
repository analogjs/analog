import { Component, Signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import {
  ActivatedRoute,
  convertToParamMap,
  ParamMap,
  provideRouter,
  Router,
  RouterOutlet,
} from '@angular/router';
import { provideLocationMocks } from '@angular/common/testing';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import { injectParams, SchemaLike, StandardSchemaV1 } from './inject-params';
import { TypedRoute } from './route-builder';

/**
 * These tests verify the runtime behavior of injectParams.
 * We use type assertions to TypedRoute to bypass TypeScript's type checking
 * because the actual type constraints require routes.d.ts to be generated.
 */

// Type alias to make tests compile - at runtime the type parameter is unused
type TestRoute = TypedRoute;

describe('inject-params', () => {
  describe('injectParams', () => {
    it('should return route params as a signal', () => {
      const paramMapSubject = new BehaviorSubject<ParamMap>(
        convertToParamMap({ productId: '123' }),
      );

      TestBed.configureTestingModule({
        providers: [
          {
            provide: ActivatedRoute,
            useValue: {
              paramMap: paramMapSubject.asObservable(),
            },
          },
        ],
      });

      const params = TestBed.runInInjectionContext(() =>
        injectParams<TestRoute>(),
      );

      expect(params()).toEqual({ productId: '123' });
    });

    it('should return multiple route params', () => {
      const paramMapSubject = new BehaviorSubject<ParamMap>(
        convertToParamMap({ userId: 'alice', postId: '42' }),
      );

      TestBed.configureTestingModule({
        providers: [
          {
            provide: ActivatedRoute,
            useValue: {
              paramMap: paramMapSubject.asObservable(),
            },
          },
        ],
      });

      const params = TestBed.runInInjectionContext(() =>
        injectParams<TestRoute>(),
      );

      expect(params()).toEqual({ userId: 'alice', postId: '42' });
    });

    it('should return empty object for routes without params', () => {
      const paramMapSubject = new BehaviorSubject<ParamMap>(
        convertToParamMap({}),
      );

      TestBed.configureTestingModule({
        providers: [
          {
            provide: ActivatedRoute,
            useValue: {
              paramMap: paramMapSubject.asObservable(),
            },
          },
        ],
      });

      const params = TestBed.runInInjectionContext(() =>
        injectParams<TestRoute>(),
      );

      expect(params()).toEqual({});
    });

    it('should update signal when route params change', () => {
      const paramMapSubject = new BehaviorSubject<ParamMap>(
        convertToParamMap({ productId: '123' }),
      );

      TestBed.configureTestingModule({
        providers: [
          {
            provide: ActivatedRoute,
            useValue: {
              paramMap: paramMapSubject.asObservable(),
            },
          },
        ],
      });

      const params = TestBed.runInInjectionContext(() =>
        injectParams<TestRoute>(),
      );

      expect(params()).toEqual({ productId: '123' });

      // Update the params
      paramMapSubject.next(convertToParamMap({ productId: '456' }));

      expect(params()).toEqual({ productId: '456' });
    });

    it('should handle params with special characters', () => {
      const paramMapSubject = new BehaviorSubject<ParamMap>(
        convertToParamMap({ slug: 'hello-world', 'not-found': 'some/path' }),
      );

      TestBed.configureTestingModule({
        providers: [
          {
            provide: ActivatedRoute,
            useValue: {
              paramMap: paramMapSubject.asObservable(),
            },
          },
        ],
      });

      const params = TestBed.runInInjectionContext(() =>
        injectParams<TestRoute>(),
      );

      expect(params()).toEqual({
        slug: 'hello-world',
        'not-found': 'some/path',
      });
    });

    it('should return a Signal type', () => {
      const paramMapSubject = new BehaviorSubject<ParamMap>(
        convertToParamMap({ id: '1' }),
      );

      TestBed.configureTestingModule({
        providers: [
          {
            provide: ActivatedRoute,
            useValue: {
              paramMap: paramMapSubject.asObservable(),
            },
          },
        ],
      });

      const params = TestBed.runInInjectionContext(() =>
        injectParams<TestRoute>(),
      );

      // Verify it's a signal (callable function that returns the value)
      expect(typeof params).toBe('function');
      expect(params()).toEqual({ id: '1' });
    });

    it('should transform params with Number constructor', () => {
      const paramMapSubject = new BehaviorSubject<ParamMap>(
        convertToParamMap({ productId: '123' }),
      );

      TestBed.configureTestingModule({
        providers: [
          {
            provide: ActivatedRoute,
            useValue: {
              paramMap: paramMapSubject.asObservable(),
            },
          },
        ],
      });

      // Use type assertions to bypass type constraints that require generated routes.d.ts
      const params = TestBed.runInInjectionContext(() =>
        (injectParams as any)('/test', { productId: Number }),
      );

      // Runtime values are now transformed to numbers
      expect(params()).toEqual({ productId: 123 });
    });

    it('should transform params with StandardSchema v1', () => {
      const paramMapSubject = new BehaviorSubject<ParamMap>(
        convertToParamMap({ productId: '789' }),
      );

      TestBed.configureTestingModule({
        providers: [
          {
            provide: ActivatedRoute,
            useValue: {
              paramMap: paramMapSubject.asObservable(),
            },
          },
        ],
      });

      // Create a StandardSchema v1 compatible schema with validate function
      const standardSchema: StandardSchemaV1<
        { productId: string },
        { productId: number }
      > = {
        '~standard': {
          version: 1,
          vendor: 'test',
          types: {
            input: { productId: '' },
            output: { productId: 0 },
          },
          validate: (value: unknown) => {
            const input = value as { productId: string };
            return {
              value: { productId: Number(input.productId) },
            };
          },
        },
      };

      // Use type assertions to bypass type constraints that require generated routes.d.ts
      const params = TestBed.runInInjectionContext(() =>
        (injectParams as any)('/test', standardSchema),
      );

      // Runtime values are now transformed via StandardSchema validate
      expect(params()).toEqual({ productId: 789 });
    });

    it('should transform params with multiple type constructors', () => {
      const paramMapSubject = new BehaviorSubject<ParamMap>(
        convertToParamMap({ userId: '42', active: 'true' }),
      );

      TestBed.configureTestingModule({
        providers: [
          {
            provide: ActivatedRoute,
            useValue: {
              paramMap: paramMapSubject.asObservable(),
            },
          },
        ],
      });

      // Use type assertions to bypass type constraints that require generated routes.d.ts
      const params = TestBed.runInInjectionContext(() =>
        (injectParams as any)('/test', { userId: Number, active: Boolean }),
      );

      // Runtime values are now transformed
      expect(params()).toEqual({ userId: 42, active: true });
    });
  });

  describe('Boolean coercion', () => {
    it('should coerce "true" to true', () => {
      const paramMapSubject = new BehaviorSubject<ParamMap>(
        convertToParamMap({ active: 'true' }),
      );

      TestBed.configureTestingModule({
        providers: [
          {
            provide: ActivatedRoute,
            useValue: { paramMap: paramMapSubject.asObservable() },
          },
        ],
      });

      const params = TestBed.runInInjectionContext(() =>
        (injectParams as any)('/test', { active: Boolean }),
      );

      expect(params()).toEqual({ active: true });
    });

    it('should coerce "false" to false', () => {
      const paramMapSubject = new BehaviorSubject<ParamMap>(
        convertToParamMap({ active: 'false' }),
      );

      TestBed.configureTestingModule({
        providers: [
          {
            provide: ActivatedRoute,
            useValue: { paramMap: paramMapSubject.asObservable() },
          },
        ],
      });

      const params = TestBed.runInInjectionContext(() =>
        (injectParams as any)('/test', { active: Boolean }),
      );

      expect(params()).toEqual({ active: false });
    });

    it('should coerce "0" to false', () => {
      const paramMapSubject = new BehaviorSubject<ParamMap>(
        convertToParamMap({ active: '0' }),
      );

      TestBed.configureTestingModule({
        providers: [
          {
            provide: ActivatedRoute,
            useValue: { paramMap: paramMapSubject.asObservable() },
          },
        ],
      });

      const params = TestBed.runInInjectionContext(() =>
        (injectParams as any)('/test', { active: Boolean }),
      );

      expect(params()).toEqual({ active: false });
    });

    it('should coerce "1" to true', () => {
      const paramMapSubject = new BehaviorSubject<ParamMap>(
        convertToParamMap({ active: '1' }),
      );

      TestBed.configureTestingModule({
        providers: [
          {
            provide: ActivatedRoute,
            useValue: { paramMap: paramMapSubject.asObservable() },
          },
        ],
      });

      const params = TestBed.runInInjectionContext(() =>
        (injectParams as any)('/test', { active: Boolean }),
      );

      expect(params()).toEqual({ active: true });
    });

    it('should coerce empty string to false', () => {
      const paramMapSubject = new BehaviorSubject<ParamMap>(
        convertToParamMap({ active: '' }),
      );

      TestBed.configureTestingModule({
        providers: [
          {
            provide: ActivatedRoute,
            useValue: { paramMap: paramMapSubject.asObservable() },
          },
        ],
      });

      const params = TestBed.runInInjectionContext(() =>
        (injectParams as any)('/test', { active: Boolean }),
      );

      expect(params()).toEqual({ active: false });
    });

    it('should coerce non-empty strings to true', () => {
      const paramMapSubject = new BehaviorSubject<ParamMap>(
        convertToParamMap({ active: 'yes' }),
      );

      TestBed.configureTestingModule({
        providers: [
          {
            provide: ActivatedRoute,
            useValue: { paramMap: paramMapSubject.asObservable() },
          },
        ],
      });

      const params = TestBed.runInInjectionContext(() =>
        (injectParams as any)('/test', { active: Boolean }),
      );

      expect(params()).toEqual({ active: true });
    });
  });

  describe('Number coercion', () => {
    it('should return NaN for invalid number strings', () => {
      const paramMapSubject = new BehaviorSubject<ParamMap>(
        convertToParamMap({ productId: 'abc' }),
      );

      TestBed.configureTestingModule({
        providers: [
          {
            provide: ActivatedRoute,
            useValue: { paramMap: paramMapSubject.asObservable() },
          },
        ],
      });

      const params = TestBed.runInInjectionContext(() =>
        (injectParams as any)('/test', { productId: Number }),
      );

      expect(params().productId).toBeNaN();
    });

    it('should transform float strings to numbers', () => {
      const paramMapSubject = new BehaviorSubject<ParamMap>(
        convertToParamMap({ price: '19.99' }),
      );

      TestBed.configureTestingModule({
        providers: [
          {
            provide: ActivatedRoute,
            useValue: { paramMap: paramMapSubject.asObservable() },
          },
        ],
      });

      const params = TestBed.runInInjectionContext(() =>
        (injectParams as any)('/test', { price: Number }),
      );

      expect(params()).toEqual({ price: 19.99 });
    });
  });

  describe('StandardSchema validation', () => {
    it('should return raw params when validation fails', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const paramMapSubject = new BehaviorSubject<ParamMap>(
        convertToParamMap({ productId: 'invalid' }),
      );

      TestBed.configureTestingModule({
        providers: [
          {
            provide: ActivatedRoute,
            useValue: { paramMap: paramMapSubject.asObservable() },
          },
        ],
      });

      const failingSchema: StandardSchemaV1<unknown, { productId: number }> = {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: () => ({
            issues: [{ message: 'Invalid product ID' }],
          }),
        },
      };

      const params = TestBed.runInInjectionContext(() =>
        (injectParams as any)('/test', failingSchema),
      );

      // Should return raw params when validation fails
      expect(params()).toEqual({ productId: 'invalid' });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('schema validation failed'),
      );

      warnSpy.mockRestore();
    });

    it('should return raw params for async validation with warning', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const paramMapSubject = new BehaviorSubject<ParamMap>(
        convertToParamMap({ productId: '123' }),
      );

      TestBed.configureTestingModule({
        providers: [
          {
            provide: ActivatedRoute,
            useValue: { paramMap: paramMapSubject.asObservable() },
          },
        ],
      });

      const asyncSchema: StandardSchemaV1<unknown, { productId: number }> = {
        '~standard': {
          version: 1,
          vendor: 'test',
          validate: () => Promise.resolve({ value: { productId: 123 } }),
        },
      };

      const params = TestBed.runInInjectionContext(() =>
        (injectParams as any)('/test', asyncSchema),
      );

      // Should return raw params when validation is async
      expect(params()).toEqual({ productId: '123' });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('async schema validation is not supported'),
      );

      warnSpy.mockRestore();
    });
  });

  describe('Edge cases', () => {
    it('should ignore schema keys not present in params', () => {
      const paramMapSubject = new BehaviorSubject<ParamMap>(
        convertToParamMap({ productId: '123' }),
      );

      TestBed.configureTestingModule({
        providers: [
          {
            provide: ActivatedRoute,
            useValue: { paramMap: paramMapSubject.asObservable() },
          },
        ],
      });

      // Schema has extra key not in params
      const params = TestBed.runInInjectionContext(() =>
        (injectParams as any)('/test', {
          productId: Number,
          categoryId: Number,
        }),
      );

      // Only productId should be in result
      expect(params()).toEqual({ productId: 123 });
    });

    it('should preserve untransformed params when schema is partial', () => {
      const paramMapSubject = new BehaviorSubject<ParamMap>(
        convertToParamMap({ productId: '123', slug: 'my-product' }),
      );

      TestBed.configureTestingModule({
        providers: [
          {
            provide: ActivatedRoute,
            useValue: { paramMap: paramMapSubject.asObservable() },
          },
        ],
      });

      // Schema only covers productId, not slug
      const params = TestBed.runInInjectionContext(() =>
        (injectParams as any)('/test', { productId: Number }),
      );

      // productId transformed, slug preserved as string
      expect(params()).toEqual({ productId: 123, slug: 'my-product' });
    });

    it('should warn for unknown schema types', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const paramMapSubject = new BehaviorSubject<ParamMap>(
        convertToParamMap({ productId: '123' }),
      );

      TestBed.configureTestingModule({
        providers: [
          {
            provide: ActivatedRoute,
            useValue: { paramMap: paramMapSubject.asObservable() },
          },
        ],
      });

      // Pass an unknown schema type (not a constructor, not a StandardSchema)
      const params = TestBed.runInInjectionContext(() =>
        (injectParams as any)('/test', { productId: 'not-a-constructor' }),
      );

      // Should return raw params
      expect(params()).toEqual({ productId: '123' });
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('unknown schema type'),
      );

      warnSpy.mockRestore();
    });
  });
});
