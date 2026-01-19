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
import { describe, expect, it } from 'vitest';
import { injectParams, SchemaLike } from './inject-params';
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

    it('should accept schema parameter with type constructors', () => {
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

      // Schema is purely for type inference, runtime behavior is unchanged
      // Use 'as any' to bypass type constraints that require generated routes.d.ts
      const params = TestBed.runInInjectionContext(() =>
        injectParams<TestRoute>({ productId: Number } as any),
      );

      // Runtime values are still strings
      expect(params()).toEqual({ productId: '123' });
    });

    it('should accept StandardSchema-compatible schema for type inference', () => {
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

      // Simulate a StandardSchema v1 compatible schema
      const standardSchema: SchemaLike<{ productId: number }> = {
        '~standard': {
          types: { output: { productId: 0 } },
        },
      };

      // Use 'as any' to bypass type constraints that require generated routes.d.ts
      const params = TestBed.runInInjectionContext(() =>
        injectParams<TestRoute>(standardSchema as any),
      );

      // Runtime values are still strings, schema only affects types
      expect(params()).toEqual({ productId: '789' });
    });

    it('should accept schema with multiple type constructors', () => {
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

      // Use 'as any' to bypass type constraints that require generated routes.d.ts
      const params = TestBed.runInInjectionContext(() =>
        injectParams<TestRoute>({ userId: Number, active: Boolean } as any),
      );

      // Runtime values are still strings
      expect(params()).toEqual({ userId: '42', active: 'true' });
    });
  });
});
