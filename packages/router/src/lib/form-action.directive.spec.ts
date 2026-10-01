import { Component, signal } from '@angular/core';
import { provideLocationMocks } from '@angular/common/testing';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router, RouterOutlet } from '@angular/router';
import { API_PREFIX } from '@analogjs/router/tokens';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FormActionState } from './form-action.directive';

// Exercise compiled signal inputs and host bindings from the published entry.
const { FormAction, createRoutes } =
  await vi.importActual<typeof import('@analogjs/router')>('@analogjs/router');

@Component({
  selector: 'analogjs-form-page',
  standalone: true,
  imports: [FormAction],
  template: `
    <form
      [enhanceForm]="enhance()"
      [action]="action()"
      [method]="method()"
      (state)="states.push($event)"
      (onSuccess)="successes.push($event)"
      (onError)="errors.push($event)"
    >
      <input name="tag" value="angular" />
      <input name="tag" value="analog" />
      <button type="submit">Submit</button>
    </form>
  `,
})
class FormPage {
  enhance = signal(true);
  action = signal('');
  method = signal('post');
  states: FormActionState[] = [];
  successes: unknown[] = [];
  errors: unknown[] = [];
}

const legacyTemplate = `
  <form [action]="action()" [method]="method()"
    data-state="application-state" aria-busy="false"
    (state)="states.push($event)"
    (onSuccess)="successes.push($event)" (onError)="errors.push($event)">
    <input name="tag" value="angular" />
    <input name="tag" value="analog" />
    <button type="submit">Submit</button>
  </form>
`;

@Component({
  selector: 'analogjs-legacy-form-page',
  standalone: true,
  imports: [FormAction],
  template: legacyTemplate,
})
class LegacyFormPage extends FormPage {}

@Component({
  selector: 'analogjs-disabled-form-page',
  standalone: true,
  imports: [FormAction],
  template: legacyTemplate.replace('<form ', '<form [enhanceForm]="false" '),
})
class DisabledFormPage extends FormPage {}

@Component({
  selector: 'analogjs-form-host',
  standalone: true,
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
class Host {}

async function setup(
  path = '/newsletter',
  mode: 'enhanced' | 'default' | 'disabled' = 'enhanced',
) {
  const component =
    mode === 'default'
      ? LegacyFormPage
      : mode === 'disabled'
        ? DisabledFormPage
        : FormPage;
  TestBed.configureTestingModule({
    imports: [Host],
    providers: [
      provideRouter([
        { path: 'plain', component: FormPage },
        ...createRoutes({
          '/src/app/pages/newsletter.page.ts': async () => ({
            default: component,
          }),
        }),
      ]),
      provideLocationMocks(),
      { provide: API_PREFIX, useValue: 'api' },
    ],
  });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const router = TestBed.inject(Router);
  await router.navigateByUrl(path);
  fixture.detectChanges();
  const page: FormPage = fixture.debugElement.query(
    By.directive(component),
  ).componentInstance;
  const form: HTMLFormElement = fixture.nativeElement.querySelector('form');
  const submit = () =>
    form.dispatchEvent(
      new Event('submit', { bubbles: true, cancelable: true }),
    );
  return { fixture, router, page, form, submit };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  TestBed.resetTestingModule();
});

describe('FormAction', () => {
  describe.each(['default', 'disabled'] as const)('%s mode', (mode) => {
    it('keeps the page endpoint and application-owned attributes', async () => {
      const fetch = vi.fn().mockResolvedValue(new Response('ok'));
      vi.stubGlobal('fetch', fetch);
      const { fixture, page, form, submit } = await setup('/newsletter', mode);
      page.action.set('/different-endpoint');
      fixture.detectChanges();
      submit();
      await vi.waitFor(() =>
        expect(page.states).toEqual(['submitting', 'success']),
      );
      expect(fetch).toHaveBeenCalledWith('/api/_analog/pages/newsletter', {
        method: 'post',
        body: expect.any(FormData),
      });
      fixture.detectChanges();
      expect(form.getAttribute('data-state')).toBe('application-state');
      expect(form.getAttribute('aria-busy')).toBe('false');
    });

    it('replaces GET queries and retains beta repeated-field handling', async () => {
      const { fixture, page, router, submit } = await setup(
        '/newsletter?tag=old&other=1',
        mode,
      );
      page.method.set('get');
      page.action.set('/search?keep=1#results');
      fixture.detectChanges();
      const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
      const navigateByUrl = vi.spyOn(router, 'navigateByUrl');
      submit();
      expect(navigate).toHaveBeenCalledWith(['/newsletter'], {
        queryParams: { tag: 'analog' },
        onSameUrlNavigation: 'reload',
      });
      expect(navigateByUrl).not.toHaveBeenCalled();
    });

    it.each(['http://localhost:3000', 'https://example.com'])(
      'keeps pathname-only redirects from %s',
      async (origin) => {
        const response = new Response(null);
        Object.defineProperties(response, {
          redirected: { value: true },
          url: { value: origin + '/newsletter?source=form#done' },
        });
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
        const { page, router, submit } = await setup('/newsletter', mode);
        const navigate = vi.spyOn(router, 'navigate').mockResolvedValue(true);
        const navigateByUrl = vi.spyOn(router, 'navigateByUrl');
        submit();
        await vi.waitFor(() =>
          expect(page.states).toEqual(['submitting', 'redirect']),
        );
        expect(navigate).toHaveBeenCalledWith(['/newsletter']);
        expect(navigateByUrl).not.toHaveBeenCalled();
      },
    );
  });

  it('restores application-owned attributes when enhancement is disabled', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok')));
    const { fixture, page, form, submit } = await setup();
    page.enhance.set(false);
    fixture.detectChanges();
    expect(form.hasAttribute('data-state')).toBe(false);
    expect(form.hasAttribute('aria-busy')).toBe(false);
    form.setAttribute('data-state', 'custom');
    form.setAttribute('aria-busy', 'false');
    page.enhance.set(true);
    fixture.detectChanges();
    submit();
    await vi.waitFor(() => expect(page.states).toContain('success'));
    fixture.detectChanges();
    expect(form.getAttribute('data-state')).toBe('success');
    page.enhance.set(false);
    fixture.detectChanges();
    expect(form.getAttribute('data-state')).toBe('custom');
    expect(form.getAttribute('aria-busy')).toBe('false');
  });

  it('replaces previous submitted values instead of accumulating GET queries', async () => {
    const { fixture, page, router, submit } = await setup(
      '/newsletter?tag=old&other=1',
    );
    page.method.set('get');
    fixture.detectChanges();
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    submit();
    submit();
    expect(navigate).toHaveBeenNthCalledWith(
      1,
      '/newsletter?other=1&tag=angular&tag=analog',
      { onSameUrlNavigation: 'reload' },
    );
    expect(navigate).toHaveBeenNthCalledWith(
      2,
      '/newsletter?other=1&tag=angular&tag=analog',
      { onSameUrlNavigation: 'reload' },
    );
  });

  it('keeps the default page endpoint and exposes busy/success state', async () => {
    let respond!: (response: Response) => void;
    const fetch = vi.fn<typeof globalThis.fetch>(
      () =>
        new Promise<Response>((resolve) => {
          respond = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetch);
    const { fixture, page, form, submit } = await setup();
    expect(form.getAttribute('data-state')).toBe('idle');
    expect(form.hasAttribute('aria-busy')).toBe(false);

    expect(submit()).toBe(false);
    fixture.detectChanges();
    expect(page.states).toEqual(['submitting']);
    expect(form.getAttribute('data-state')).toBe('submitting');
    expect(form.getAttribute('aria-busy')).toBe('true');
    expect(fetch).toHaveBeenCalledWith('/api/_analog/pages/newsletter', {
      method: 'post',
      body: expect.any(FormData),
    });
    expect((fetch.mock.calls[0][1]?.body as FormData).getAll('tag')).toEqual([
      'angular',
      'analog',
    ]);

    respond(
      new Response(JSON.stringify({ ok: true }), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
      }),
    );
    await vi.waitFor(() =>
      expect(page.states).toEqual(['submitting', 'success']),
    );
    fixture.detectChanges();
    expect(page.successes).toEqual([{ ok: true }]);
    expect(form.getAttribute('data-state')).toBe('success');
    expect(form.hasAttribute('aria-busy')).toBe(false);
  });

  it('uses the fallback endpoint on routes without Analog metadata', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', fetch);
    const { fixture, page, form, submit } = await setup('/plain');
    vi.stubGlobal('window', {
      location: {
        href: new URL('/plain', window.location.href).href,
        origin: window.location.origin,
        pathname: '/plain',
      },
    });

    submit();
    await vi.waitFor(() =>
      expect(page.states).toEqual(['submitting', 'success']),
    );
    expect(fetch).toHaveBeenCalledWith('/api/_analog/pages/plain', {
      method: 'post',
      body: expect.any(FormData),
    });
    fixture.detectChanges();
    expect(form.hasAttribute('aria-busy')).toBe(false);
  });

  it('honors the current action input and native action attribute', async () => {
    const fetch = vi.fn().mockResolvedValue(new Response('ok'));
    vi.stubGlobal('fetch', fetch);
    const { fixture, page, form, submit } = await setup('/plain');
    form.setAttribute('action', '/native');
    page.action.set('/submit?source=form');
    fixture.detectChanges();
    submit();
    await vi.waitFor(() => expect(page.states).toContain('success'));
    expect(fetch.mock.calls[0][0]).toBe(
      new URL('/submit?source=form', window.location.href).href,
    );
    expect(page.successes).toEqual(['ok']);

    fetch.mockResolvedValue(new Response('again'));
    page.action.set('');
    fixture.detectChanges();
    submit();
    await vi.waitFor(() => expect(page.successes).toEqual(['ok', 'again']));
    expect(fetch.mock.calls[1][0]).toBe(
      new URL('/native', window.location.href).href,
    );
  });

  it('preserves repeated GET fields and an explicit destination query and fragment', async () => {
    const { fixture, page, router, submit } = await setup();
    page.method.set('get');
    page.action.set('/search?existing=1#results');
    fixture.detectChanges();
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    submit();
    expect(navigate).toHaveBeenCalledWith(
      '/search?existing=1&tag=angular&tag=analog#results',
      { onSameUrlNavigation: 'reload' },
    );
    expect(page.states).toEqual(['submitting', 'navigate']);
  });

  it('uses the current route for GET without an explicit action', async () => {
    const { fixture, page, router, submit } = await setup();
    page.method.set('get');
    fixture.detectChanges();
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    submit();
    expect(navigate).toHaveBeenCalledWith(
      '/newsletter?tag=angular&tag=analog',
      { onSameUrlNavigation: 'reload' },
    );
  });

  it('keeps query parameters and fragments on same-origin redirects', async () => {
    const response = new Response(null);
    Object.defineProperties(response, {
      redirected: { value: true },
      url: {
        value: new URL('/thanks?source=newsletter#done', window.location.href)
          .href,
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const { page, router, submit } = await setup();
    const navigate = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    submit();
    await vi.waitFor(() =>
      expect(page.states).toEqual(['submitting', 'redirect']),
    );
    expect(navigate).toHaveBeenCalledWith('/thanks?source=newsletter#done', {
      onSameUrlNavigation: 'reload',
    });
    expect(page.successes).toEqual([]);
  });

  it('uses browser navigation for external GET destinations', async () => {
    const { fixture, page, router, submit } = await setup();
    page.method.set('get');
    page.action.set('https://example.com/search#results');
    fixture.detectChanges();
    const navigate = vi.spyOn(router, 'navigateByUrl');
    const assign = vi.fn();
    vi.stubGlobal('window', {
      location: {
        href: window.location.href,
        origin: window.location.origin,
        assign,
      },
    });
    submit();
    expect(assign).toHaveBeenCalledWith(
      'https://example.com/search?tag=angular&tag=analog#results',
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('uses browser navigation for complete external redirect URLs', async () => {
    const response = new Response(null);
    Object.defineProperties(response, {
      redirected: { value: true },
      url: { value: 'https://example.com/thanks?source=form#done' },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
    const { page, router, submit } = await setup();
    const navigate = vi.spyOn(router, 'navigateByUrl');
    const assign = vi.fn();
    vi.stubGlobal('window', {
      location: {
        href: window.location.href,
        origin: window.location.origin,
        assign,
      },
    });
    submit();
    await vi.waitFor(() => expect(page.states).toContain('redirect'));
    expect(assign).toHaveBeenCalledWith(
      'https://example.com/thanks?source=form#done',
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('emits validation issues unchanged and clears busy state', async () => {
    const issues = [{ message: 'Required', path: ['email'] }];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(issues), {
          status: 422,
          headers: { 'X-Analog-Errors': 'true' },
        }),
      ),
    );
    const { fixture, page, form, submit } = await setup();
    submit();
    await vi.waitFor(() =>
      expect(page.states).toEqual(['submitting', 'error']),
    );
    fixture.detectChanges();
    expect(page.errors).toEqual([issues]);
    expect(form.getAttribute('data-state')).toBe('error');
    expect(form.hasAttribute('aria-busy')).toBe(false);
  });

  it.each(['network', 'invalid-json', 'http-error'] as const)(
    'clears busy state after %s failures',
    async (failure) => {
      const fetch = vi.fn();
      if (failure === 'network') {
        fetch.mockRejectedValue(new Error('offline'));
      } else if (failure === 'invalid-json') {
        fetch.mockResolvedValue(
          new Response('invalid', {
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      } else {
        fetch.mockResolvedValue(new Response('failed', { status: 500 }));
      }
      vi.stubGlobal('fetch', fetch);
      const { fixture, page, form, submit } = await setup();
      submit();
      await vi.waitFor(() =>
        expect(page.states).toEqual(['submitting', 'error']),
      );
      fixture.detectChanges();
      expect(form.hasAttribute('aria-busy')).toBe(false);
      expect(page.successes).toEqual([]);
    },
  );
});
