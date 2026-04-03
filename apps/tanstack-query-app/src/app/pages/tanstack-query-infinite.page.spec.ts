import { TestBed } from '@angular/core/testing';
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
import TanStackQueryInfinitePageComponent from './tanstack-query-infinite.page';

const mockRoute = {
  queryParamMap: of(convertToParamMap({ scope: 'infinite-test' })),
  snapshot: { queryParamMap: convertToParamMap({ scope: 'infinite-test' }) },
};

describe('TanStackQueryInfinitePageComponent', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TanStackQueryInfinitePageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        { provide: ActivatedRoute, useValue: mockRoute },
      ],
    }).compileComponents();
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.verify();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(TanStackQueryInfinitePageComponent);
    expect(fixture.componentInstance).toBeTruthy();
    httpTesting.match(() => true);
  });

  it('should read scope from query params', () => {
    const fixture = TestBed.createComponent(TanStackQueryInfinitePageComponent);
    expect(fixture.componentInstance.scope()).toBe('infinite-test');
    httpTesting.match(() => true);
  });

  it('should show loading state initially', () => {
    const fixture = TestBed.createComponent(TanStackQueryInfinitePageComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#comments-loading')).toBeTruthy();
    httpTesting.match(() => true);
  });

  it('should render comments and load-more button after query resolves', async () => {
    const fixture = TestBed.createComponent(TanStackQueryInfinitePageComponent);
    fixture.detectChanges();

    const req = httpTesting.expectOne((r) =>
      r.url.includes('/api/v1/query-comments'),
    );
    req.flush({
      fetchCount: 1,
      items: [
        { id: '1', text: 'First comment' },
        { id: '2', text: 'Second comment' },
      ],
      nextCursor: 2,
    });

    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#comments-loading')).toBeFalsy();
    expect(compiled.querySelector('#comments-list')).toBeTruthy();
    expect(compiled.textContent).toContain('First comment');
    expect(compiled.textContent).toContain('Second comment');
    expect(compiled.querySelector('#load-more')).toBeTruthy();
  });
});
