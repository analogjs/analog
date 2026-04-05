import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { injectParams, injectQuery } from './inject-typed-params';
import { EXPERIMENTAL_TYPED_ROUTER } from './experimental';

describe('injectParams', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return params signal from ActivatedRoute', () => {
    const params$ = new BehaviorSubject({ id: '42' });

    TestBed.configureTestingModule({
      providers: [{ provide: ActivatedRoute, useValue: { params: params$ } }],
    });

    const params = TestBed.runInInjectionContext(() =>
      injectParams('/users/[id]' as any),
    );

    expect(params()).toEqual({ id: '42' });
  });

  it('should warn on param mismatch when strictRouteParams is enabled', () => {
    const params$ = new BehaviorSubject({});
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    TestBed.configureTestingModule({
      providers: [
        { provide: ActivatedRoute, useValue: { params: params$ } },
        {
          provide: EXPERIMENTAL_TYPED_ROUTER,
          useValue: { strictRouteParams: true },
        },
      ],
    });

    TestBed.runInInjectionContext(() => injectParams('/users/[id]' as any));

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('expected param "id"'),
    );
  });

  it('should not warn when strictRouteParams is disabled', () => {
    const params$ = new BehaviorSubject({});
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    TestBed.configureTestingModule({
      providers: [{ provide: ActivatedRoute, useValue: { params: params$ } }],
    });

    TestBed.runInInjectionContext(() => injectParams('/users/[id]' as any));

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('should not warn when params match the declared route', () => {
    const params$ = new BehaviorSubject({ id: '42' });
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    TestBed.configureTestingModule({
      providers: [
        { provide: ActivatedRoute, useValue: { params: params$ } },
        {
          provide: EXPERIMENTAL_TYPED_ROUTER,
          useValue: { strictRouteParams: true },
        },
      ],
    });

    TestBed.runInInjectionContext(() => injectParams('/users/[id]' as any));

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('should not warn for static routes with no params', () => {
    const params$ = new BehaviorSubject({});
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    TestBed.configureTestingModule({
      providers: [
        { provide: ActivatedRoute, useValue: { params: params$ } },
        {
          provide: EXPERIMENTAL_TYPED_ROUTER,
          useValue: { strictRouteParams: true },
        },
      ],
    });

    TestBed.runInInjectionContext(() => injectParams('/about' as any));

    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('should not warn for optional catch-all params when omitted', () => {
    const params$ = new BehaviorSubject({});
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    TestBed.configureTestingModule({
      providers: [
        { provide: ActivatedRoute, useValue: { params: params$ } },
        {
          provide: EXPERIMENTAL_TYPED_ROUTER,
          useValue: { strictRouteParams: true },
        },
      ],
    });

    TestBed.runInInjectionContext(() =>
      injectParams('/shop/[[...category]]' as any),
    );

    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe('injectQuery', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return query params signal from ActivatedRoute', () => {
    const queryParams$ = new BehaviorSubject({ page: '1' });

    TestBed.configureTestingModule({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: {
            params: new BehaviorSubject({}),
            queryParams: queryParams$,
          },
        },
      ],
    });

    const query = TestBed.runInInjectionContext(() =>
      injectQuery('/issues' as any),
    );

    expect(query()).toEqual({ page: '1' });
  });

  it('should warn on param mismatch when strictRouteParams is enabled', () => {
    const params$ = new BehaviorSubject({});
    const queryParams$ = new BehaviorSubject({});
    const warnSpy = vi
      .spyOn(console, 'warn')
      .mockImplementation(() => undefined);

    TestBed.configureTestingModule({
      providers: [
        {
          provide: ActivatedRoute,
          useValue: { params: params$, queryParams: queryParams$ },
        },
        {
          provide: EXPERIMENTAL_TYPED_ROUTER,
          useValue: { strictRouteParams: true },
        },
      ],
    });

    TestBed.runInInjectionContext(() => injectQuery('/users/[id]' as any));

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('expected param "id"'),
    );
  });
});
