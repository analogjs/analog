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
import { injectParams } from './inject-params';
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
  });
});
