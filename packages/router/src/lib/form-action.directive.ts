import {
  booleanAttribute,
  Directive,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  output,
  Renderer2,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { ActivatedRoute, Params, Router } from '@angular/router';

import { injectRouteEndpointURL } from './inject-route-endpoint-url';
import { ANALOG_META_KEY } from './endpoints';

export type FormActionState =
  | 'submitting'
  | 'error'
  | 'redirect'
  | 'success'
  | 'navigate';

@Directive({
  // eslint-disable-next-line @angular-eslint/directive-selector
  selector: 'form[action],form[method],form[enhanceForm]',
  host: {
    '(submit)': `submitted($event)`,
  },
  standalone: true,
})
export class FormAction {
  action = input<string>('');
  enhanceForm = input(false, { transform: booleanAttribute });
  // eslint-disable-next-line @angular-eslint/no-output-on-prefix
  onSuccess = output<unknown>();
  // eslint-disable-next-line @angular-eslint/no-output-on-prefix
  onError = output<unknown>();
  state = output<FormActionState>();
  private currentState = signal<FormActionState | 'idle'>('idle');
  private injector = inject(Injector);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private path = this._getPath();

  constructor() {
    const form = inject(ElementRef<HTMLFormElement>).nativeElement;
    const renderer = inject(Renderer2);
    effect((onCleanup) => {
      if (!this.enhanceForm()) {
        return;
      }

      const previous = {
        'data-state': form.getAttribute('data-state'),
        'aria-busy': form.getAttribute('aria-busy'),
      };
      const state = this.currentState();
      renderer.setAttribute(form, 'data-state', state);
      if (state === 'submitting') {
        renderer.setAttribute(form, 'aria-busy', 'true');
      } else {
        renderer.removeAttribute(form, 'aria-busy');
      }
      onCleanup(() => {
        for (const [name, value] of Object.entries(previous)) {
          if (value === null) {
            renderer.removeAttribute(form, name);
          } else {
            renderer.setAttribute(form, name, value);
          }
        }
      });
    });
  }

  submitted($event: any) {
    $event.preventDefault();

    this._emitState('submitting');
    const body = new FormData($event.target);

    if (this.enhanceForm()) {
      const form = $event.target as HTMLFormElement;
      try {
        const action =
          this.action().trim() || form.getAttribute('action')?.trim();
        if (form.method.toUpperCase() === 'GET') {
          this._handleEnhancedGet(body, action || this.router.url);
        } else {
          const path = action
            ? new URL(action, window.location.href).toString()
            : this._getPath();
          void this._handleEnhancedPost(body, path, form.method);
        }
      } catch {
        this._emitState('error');
      }
      return;
    }

    if ($event.target.method.toUpperCase() === 'GET') {
      this._handleGet(body, this.router.url);
    } else {
      this._handlePost(body, this.path, $event);
    }
  }

  private _handleGet(body: FormData, path: string) {
    const params: Params = {};
    body.forEach((formVal, formKey) => (params[formKey] = formVal));

    this._emitState('navigate');
    const url = path.split('?')[0];
    this.router.navigate([url], {
      queryParams: params,
      onSameUrlNavigation: 'reload',
    });
  }

  private _handlePost(
    body: FormData,
    path: string,
    $event: { target: HTMLFormElement } & Event,
  ) {
    fetch(path, {
      method: $event.target.method,
      body,
    })
      .then((res) => {
        if (res.ok) {
          if (res.redirected) {
            const redirectUrl = new URL(res.url).pathname;
            this._emitState('redirect');
            this.router.navigate([redirectUrl]);
          } else if (this._isJSON(res.headers.get('Content-type'))) {
            res.json().then((result) => {
              this.onSuccess.emit(result);
              this._emitState('success');
            });
          } else {
            res.text().then((result) => {
              this.onSuccess.emit(result);
              this._emitState('success');
            });
          }
        } else {
          if (res.headers.get('X-Analog-Errors')) {
            res.json().then((errors: unknown) => {
              this.onError.emit(errors);
              this._emitState('error');
            });
          } else {
            this._emitState('error');
          }
        }
      })
      .catch((_) => {
        this._emitState('error');
      });
  }

  private _getPath() {
    const snapshot = this.route.snapshot;
    if (snapshot.routeConfig && ANALOG_META_KEY in snapshot.routeConfig) {
      return runInInjectionContext(this.injector, () =>
        injectRouteEndpointURL(snapshot),
      ).pathname;
    }

    return `/api/_analog/pages${window.location.pathname}`;
  }

  private _handleEnhancedGet(body: FormData, path: string) {
    const url = new URL(path, window.location.href);
    const params = new URLSearchParams(url.search);
    body.forEach((_value, key) => params.delete(key));
    body.forEach((value, key) => {
      params.append(key, value instanceof File ? value.name : value);
    });
    url.search = params.toString();

    this._emitState('navigate');
    this._navigateTo(url);
  }

  private async _handleEnhancedPost(
    body: FormData,
    path: string,
    method: string,
  ) {
    try {
      const response = await fetch(path, { method, body });
      if (response.ok) {
        if (response.redirected) {
          this._emitState('redirect');
          this._navigateTo(new URL(response.url, window.location.href));
        } else {
          const result = this._isJSON(response.headers.get('Content-type'))
            ? await response.json()
            : await response.text();
          this.onSuccess.emit(result);
          this._emitState('success');
        }
      } else {
        if (response.headers.get('X-Analog-Errors')) {
          this.onError.emit(await response.json());
        }
        this._emitState('error');
      }
    } catch {
      this._emitState('error');
    }
  }

  private _emitState(state: FormActionState) {
    this.currentState.set(state);
    this.state.emit(state);
  }

  private _navigateTo(url: URL) {
    if (url.origin === window.location.origin) {
      void this.router.navigateByUrl(
        `${url.pathname}${url.search}${url.hash}`,
        {
          onSameUrlNavigation: 'reload',
        },
      );
      return;
    }

    window.location.assign(url.toString());
  }

  private _isJSON(contentType: string | null): boolean {
    const mime = contentType ? contentType.split(';') : [];
    const essence = mime[0];

    return essence === 'application/json';
  }
}
