import { Component } from '@angular/core';
import { provideLocationMocks } from '@angular/common/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { ActivatedRoute, provideRouter, Router } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_PREFIX } from '@analogjs/router/tokens';

import { ANALOG_META_KEY } from './endpoints';
import { FormAction } from './form-action.directive';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

@Component({
  standalone: true,
  imports: [FormAction],
  template: `
    <form
      action="/submit"
      method="post"
      (onStateChange)="stateChanges.push($event)"
      (onSuccess)="successes.push($event)"
      (onError)="errors.push($event)"
    >
      <input type="hidden" name="tag" value="angular" />
      <input type="hidden" name="tag" value="analog" />
      <button type="submit">Submit</button>
    </form>
  `,
})
class PostHostComponent {
  stateChanges: string[] = [];
  successes: unknown[] = [];
  errors: unknown[] = [];
}

@Component({
  standalone: true,
  imports: [FormAction],
  template: `
    <form
      action="/search?existing=1"
      method="get"
      (onStateChange)="stateChanges.push($event)"
    >
      <input type="hidden" name="tag" value="angular" />
      <input type="hidden" name="tag" value="analog" />
      <button type="submit">Submit</button>
    </form>
  `,
})
class GetHostComponent {
  stateChanges: string[] = [];
  successes: unknown[] = [];
  errors: unknown[] = [];
}

describe('FormAction', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    TestBed.configureTestingModule({
      imports: [PostHostComponent, GetHostComponent],
      providers: [
        provideRouter([]),
        provideLocationMocks(),
        { provide: API_PREFIX, useValue: 'api' },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              routeConfig: {
                [ANALOG_META_KEY]: {
                  endpoint: '/pages/index',
                  endpointKey: '/pages/index.server.ts',
                },
              },
              queryParams: {},
              fragment: null,
              params: {},
              parent: null,
            },
          },
        },
      ],
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  function getDirective(
    fixture: ComponentFixture<PostHostComponent | GetHostComponent>,
  ): FormAction {
    return fixture.debugElement
      .query(By.directive(FormAction))
      .injector.get(FormAction);
  }

  it('emits both state outputs and updates host state during submission', async () => {
    const pendingResponse = deferred<Response>();
    globalThis.fetch = vi.fn(() => pendingResponse.promise) as typeof fetch;

    const fixture = TestBed.createComponent(PostHostComponent);
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    const directive = getDirective(fixture);
    const stateChanges: string[] = [];
    const successes: unknown[] = [];

    directive.state.subscribe((state) => stateChanges.push(state));
    directive.onSuccess.subscribe((result) => successes.push(result));

    directive.submitted({
      preventDefault: vi.fn(),
      target: form,
    });
    fixture.detectChanges();

    expect(stateChanges).toEqual(['submitting']);
    expect(form.getAttribute('data-state')).toBe('submitting');
    expect(form.getAttribute('aria-busy')).toBe('true');

    pendingResponse.resolve(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    );

    await Promise.resolve();
    await Promise.resolve();
    fixture.detectChanges();

    expect(successes).toEqual([{ ok: true }]);
    expect(stateChanges).toEqual(['submitting', 'success']);
    expect(form.getAttribute('data-state')).toBe('success');
    expect(form.getAttribute('aria-busy')).toBeNull();
  });

  it('uses the explicit form action for POST submissions', async () => {
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
          },
        }),
      ),
    ) as typeof fetch;

    const fixture = TestBed.createComponent(PostHostComponent);
    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    getDirective(fixture).submitted({
      preventDefault: vi.fn(),
      target: form,
    });

    await Promise.resolve();

    expect(globalThis.fetch).toHaveBeenCalledWith(
      new URL('/submit', window.location.href).toString(),
      expect.objectContaining({
        method: 'post',
      }),
    );
  });

  it('preserves repeated query params for GET submissions', async () => {
    const fixture = TestBed.createComponent(GetHostComponent);
    const router = TestBed.inject(Router);
    const navigateByUrl = vi
      .spyOn(router, 'navigateByUrl')
      .mockResolvedValue(true);

    fixture.detectChanges();

    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;
    getDirective(fixture).submitted({
      preventDefault: vi.fn(),
      target: form,
    });

    expect(navigateByUrl).toHaveBeenCalledWith(
      '/search?existing=1&tag=angular&tag=analog',
      {
        onSameUrlNavigation: 'reload',
      },
    );
  });
});
