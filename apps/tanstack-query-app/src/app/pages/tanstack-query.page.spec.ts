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
import TanStackQueryPageComponent from './tanstack-query.page';

describe('TanStackQueryPageComponent', () => {
  let httpTesting: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TanStackQueryPageComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideTanStackQuery(new QueryClient()),
        {
          provide: ActivatedRoute,
          useValue: {
            queryParamMap: of(convertToParamMap({ scope: 'test-scope' })),
            snapshot: {
              queryParamMap: convertToParamMap({ scope: 'test-scope' }),
            },
          },
        },
      ],
    }).compileComponents();
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    // Flush any outstanding requests before verify
    httpTesting.match(() => true);
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(TanStackQueryPageComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should read the scope from query params', () => {
    const fixture = TestBed.createComponent(TanStackQueryPageComponent);
    expect(fixture.componentInstance.scope()).toBe('test-scope');
  });

  it('should show loading state initially', () => {
    const fixture = TestBed.createComponent(TanStackQueryPageComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#todo-loading')).toBeTruthy();
  });

  it('should call createTodo with the provided title', () => {
    const fixture = TestBed.createComponent(TanStackQueryPageComponent);
    fixture.detectChanges();

    const spy = vi.spyOn(
      fixture.componentInstance.createTodoMutation,
      'mutate',
    );
    fixture.componentInstance.createTodo('New todo');
    expect(spy).toHaveBeenCalledWith({
      scope: 'test-scope',
      title: 'New todo',
    });
  });
});
