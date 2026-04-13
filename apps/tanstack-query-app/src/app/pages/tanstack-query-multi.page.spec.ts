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
import TanStackQueryMultiPageComponent from './tanstack-query-multi.page';

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
    httpTesting.match(() => true);
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(TanStackQueryMultiPageComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should read scope from query params', () => {
    const fixture = TestBed.createComponent(TanStackQueryMultiPageComponent);
    expect(fixture.componentInstance.scope()).toBe('multi-test');
  });

  it('should show loading state for posts and featured post', () => {
    const fixture = TestBed.createComponent(TanStackQueryMultiPageComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('#posts-loading')).toBeTruthy();
    expect(compiled.querySelector('#featured-loading')).toBeTruthy();
  });
});
