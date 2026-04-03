import '../testing/init-test-env';
import { provideZonelessChangeDetection } from '@angular/core';
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

describe('TanStackQueryInfinitePageComponent', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TanStackQueryInfinitePageComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: of(convertToParamMap({ scope: 'infinite-test' })),
            snapshot: {
              queryParamMap: convertToParamMap({ scope: 'infinite-test' }),
            },
          },
        },
      ],
    }).compileComponents();
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpTesting.match(() => true);
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(TanStackQueryInfinitePageComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should read scope from query params', () => {
    const fixture = TestBed.createComponent(TanStackQueryInfinitePageComponent);
    expect(fixture.componentInstance.scope()).toBe('infinite-test');
  });

  it('should show loading state initially', () => {
    const fixture = TestBed.createComponent(TanStackQueryInfinitePageComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#comments-loading')).toBeTruthy();
  });
});
