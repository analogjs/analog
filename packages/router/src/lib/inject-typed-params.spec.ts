import { TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { injectParams, injectQuery } from './inject-typed-params';

describe('injectParams', () => {
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
});

describe('injectQuery', () => {
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
});

import { Injector } from '@angular/core';
import { UrlSegment } from '@angular/router';

it('supports an explicit injector outside an injection context and stays reactive', () => {
  const params = new BehaviorSubject({ id: '42' });
  const queryParams = new BehaviorSubject({ page: '1' });
  TestBed.configureTestingModule({
    providers: [{ provide: ActivatedRoute, useValue: { params, queryParams } }],
  });
  const injector = TestBed.inject(Injector);
  const value = injectParams('/users/[id]' as any, { injector });
  const query = injectQuery('/users/[id]' as any, { injector });
  expect(value()).toEqual({ id: '42' });
  expect(query()).toEqual({ page: '1' });
  params.next({ id: '43' });
  queryParams.next({ page: '2' });
  expect(value()).toEqual({ id: '43' });
  expect(query()).toEqual({ page: '2' });
});

it('normalizes beta wildcard segments and inherits parent parameters', () => {
  const wildcard = {
    params: new BehaviorSubject({ team: 'one' }),
    url: new BehaviorSubject([
      new UrlSegment('a', {}),
      new UrlSegment('b', {}),
    ]),
    routeConfig: { path: '**' },
  };
  const route = { params: new BehaviorSubject({}), pathFromRoot: [wildcard] };
  TestBed.configureTestingModule({
    providers: [{ provide: ActivatedRoute, useValue: route }],
  });
  const value = TestBed.runInInjectionContext(() =>
    injectParams('/[team]/[...slug]' as any),
  );
  expect(value()).toEqual({ team: 'one', slug: ['a', 'b'] });
});

it('normalizes optional catch-all strings without coercing dynamic values', () => {
  const params = new BehaviorSubject({ id: '42', slug: 'a/b' });
  TestBed.configureTestingModule({
    providers: [{ provide: ActivatedRoute, useValue: { params } }],
  });
  const value = TestBed.runInInjectionContext(() =>
    injectParams('/[id]/[[...slug]]' as any),
  );
  expect(value()).toEqual({ id: '42', slug: ['a', 'b'] });
});
