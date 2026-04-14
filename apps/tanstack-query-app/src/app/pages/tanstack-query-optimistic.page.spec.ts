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
import TanStackQueryOptimisticPageComponent from './tanstack-query-optimistic.page';

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
    httpTesting.match(() => true);
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(
      TanStackQueryOptimisticPageComponent,
    );
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should read scope from query params', () => {
    const fixture = TestBed.createComponent(
      TanStackQueryOptimisticPageComponent,
    );
    expect(fixture.componentInstance.scope()).toBe('optimistic-test');
  });

  it('should show loading state initially', () => {
    const fixture = TestBed.createComponent(
      TanStackQueryOptimisticPageComponent,
    );
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#comments-loading')).toBeTruthy();
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
  });

  it('should initialize signal state correctly', () => {
    const fixture = TestBed.createComponent(
      TanStackQueryOptimisticPageComponent,
    );
    expect(fixture.componentInstance.mutationError()).toBe('');
    expect(fixture.componentInstance.rolledBack()).toBe(false);
    expect(fixture.componentInstance.optimisticApplied()).toBe(false);
  });
});
