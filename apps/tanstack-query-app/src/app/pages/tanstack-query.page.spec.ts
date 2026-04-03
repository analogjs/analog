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
import TanStackQueryPageComponent from './tanstack-query.page';

getTestBed().initTestEnvironment(
  BrowserTestingModule,
  platformBrowserTesting(),
);

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
    httpTesting.verify();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(TanStackQueryPageComponent);
    expect(fixture.componentInstance).toBeTruthy();
    httpTesting.match(() => true);
  });

  it('should read the scope from query params', () => {
    const fixture = TestBed.createComponent(TanStackQueryPageComponent);
    expect(fixture.componentInstance.scope()).toBe('test-scope');
    httpTesting.match(() => true);
  });

  it('should show loading state initially', () => {
    const fixture = TestBed.createComponent(TanStackQueryPageComponent);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#todo-loading')).toBeTruthy();
    httpTesting.match(() => true);
  });

  it('should render todos after query resolves', async () => {
    const fixture = TestBed.createComponent(TanStackQueryPageComponent);
    fixture.detectChanges();

    const req = httpTesting.expectOne((r) =>
      r.url.includes('/api/v1/query-todos'),
    );
    req.flush({
      fetchCount: 1,
      items: [
        { id: '1', title: 'First todo' },
        { id: '2', title: 'Second todo' },
      ],
    });

    await fixture.whenStable();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('#todo-loading')).toBeFalsy();
    expect(compiled.querySelector('#todo-list')).toBeTruthy();
    expect(compiled.textContent).toContain('First todo');
    expect(compiled.textContent).toContain('Second todo');
    expect(
      compiled.querySelector('#todo-fetch-count')?.textContent?.trim(),
    ).toBe('1');
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

    httpTesting.match(() => true);
  });
});
