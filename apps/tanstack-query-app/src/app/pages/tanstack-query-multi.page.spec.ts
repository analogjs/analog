import '@angular/compiler';
import { provideZonelessChangeDetection } from '@angular/core';
import { getTestBed, TestBed } from '@angular/core/testing';
import {
  BrowserTestingModule,
  platformBrowserTesting,
} from '@angular/platform-browser/testing';
import { provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import {
  QueryClient,
  provideTanStackQuery,
} from '@tanstack/angular-query-experimental';
import { of } from 'rxjs';
import TanStackQueryMultiPageComponent from './tanstack-query-multi.page';

getTestBed().initTestEnvironment(
  BrowserTestingModule,
  platformBrowserTesting(),
);

describe('TanStackQueryMultiPageComponent', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TanStackQueryMultiPageComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: of(convertToParamMap({ scope: 'multi-test' })),
            snapshot: {
              queryParamMap: convertToParamMap({ scope: 'multi-test' }),
            },
          },
        },
      ],
    }).compileComponents();
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(TanStackQueryMultiPageComponent);
    expect(fixture.componentInstance).toBeTruthy();
    httpTesting.match(() => true);
  });

  it('should read scope from query params', () => {
    const fixture = TestBed.createComponent(TanStackQueryMultiPageComponent);
    expect(fixture.componentInstance.scope()).toBe('multi-test');
    httpTesting.match(() => true);
  });

  it('should show loading state for posts and featured post', () => {
    const fixture = TestBed.createComponent(TanStackQueryMultiPageComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('#posts-loading')).toBeTruthy();
    expect(compiled.querySelector('#featured-loading')).toBeTruthy();
    httpTesting.match(() => true);
  });

  it('should render posts after query resolves', async () => {
    const fixture = TestBed.createComponent(TanStackQueryMultiPageComponent);
    fixture.detectChanges();

    const reqs = httpTesting.match((r) =>
      r.url.includes('/api/v1/query-posts'),
    );

    for (const req of reqs) {
      const params = req.request.params;
      if (params.get('postId') === '1') {
        req.flush({
          post: { id: '1', title: 'Featured', author: 'Alice' },
          detailFetchCount: 1,
        });
      } else {
        req.flush({
          posts: [
            { id: '1', title: 'Post 1', author: 'Alice' },
            { id: '2', title: 'Post 2', author: 'Bob' },
          ],
          listFetchCount: 1,
        });
      }
    }

    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#posts-loading')).toBeFalsy();
    expect(compiled.querySelector('#posts-list')).toBeTruthy();

    // Flush any dependent author-posts query
    httpTesting
      .match(() => true)
      .forEach((r) =>
        r.flush({
          authorPosts: [{ id: '1', title: 'Post 1' }],
          authorFetchCount: 1,
        }),
      );
  });
});
