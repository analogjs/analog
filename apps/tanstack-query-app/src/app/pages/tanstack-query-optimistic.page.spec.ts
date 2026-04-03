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
import TanStackQueryOptimisticPageComponent from './tanstack-query-optimistic.page';

getTestBed().initTestEnvironment(
  BrowserTestingModule,
  platformBrowserTesting(),
);

describe('TanStackQueryOptimisticPageComponent', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TanStackQueryOptimisticPageComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: of(convertToParamMap({ scope: 'optimistic-test' })),
            snapshot: {
              queryParamMap: convertToParamMap({ scope: 'optimistic-test' }),
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
    const fixture = TestBed.createComponent(
      TanStackQueryOptimisticPageComponent,
    );
    expect(fixture.componentInstance).toBeTruthy();
    httpTesting.match(() => true);
  });

  it('should read scope from query params', () => {
    const fixture = TestBed.createComponent(
      TanStackQueryOptimisticPageComponent,
    );
    expect(fixture.componentInstance.scope()).toBe('optimistic-test');
    httpTesting.match(() => true);
  });

  it('should show loading state initially', () => {
    const fixture = TestBed.createComponent(
      TanStackQueryOptimisticPageComponent,
    );
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#comments-loading')).toBeTruthy();
    httpTesting.match(() => true);
  });

  it('should render comments after query resolves', async () => {
    const fixture = TestBed.createComponent(
      TanStackQueryOptimisticPageComponent,
    );
    fixture.detectChanges();

    const req = httpTesting.expectOne((r) =>
      r.url.includes('/api/v1/query-comments'),
    );
    req.flush({
      fetchCount: 1,
      items: [{ id: '1', text: 'Existing comment' }],
    });

    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#comments-loading')).toBeFalsy();
    expect(compiled.querySelector('#comments-list')).toBeTruthy();
    expect(compiled.textContent).toContain('Existing comment');
  });

  it('should call addComment with the provided text', () => {
    const fixture = TestBed.createComponent(
      TanStackQueryOptimisticPageComponent,
    );
    fixture.detectChanges();

    const spy = vi.spyOn(
      fixture.componentInstance.createCommentMutation,
      'mutate',
    );
    fixture.componentInstance.addComment('Great post!');
    expect(spy).toHaveBeenCalledWith({
      scope: 'optimistic-test',
      text: 'Great post!',
    });

    httpTesting.match(() => true);
  });

  it('should initialize signal state correctly', () => {
    const fixture = TestBed.createComponent(
      TanStackQueryOptimisticPageComponent,
    );
    expect(fixture.componentInstance.mutationError()).toBe('');
    expect(fixture.componentInstance.rolledBack()).toBe(false);
    expect(fixture.componentInstance.optimisticApplied()).toBe(false);
    httpTesting.match(() => true);
  });
});
