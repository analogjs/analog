import {
  Directive,
  Injector,
  inject,
  input,
  output,
  runInInjectionContext,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

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
  selector: 'form[action],form[method]',
  host: {
    '(submit)': `submitted($event)`,
    '[attr.data-state]': 'currentState()',
    '[attr.aria-busy]': 'currentState() === "submitting" ? "true" : null',
  },
  standalone: true,
})
export class FormAction {
  action = input<string>('');
  // eslint-disable-next-line @angular-eslint/no-output-on-prefix
  onSuccess = output<unknown>();
  // eslint-disable-next-line @angular-eslint/no-output-on-prefix
  onError = output<unknown>();
  state = output<FormActionState>();
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  protected currentState = signal<FormActionState | 'idle'>('idle');
  private injector = inject(Injector);

  submitted($event: SubmitEvent): void {
    $event.preventDefault();

    const form = $event.target as HTMLFormElement;
    this._emitState('submitting');
    const body = new FormData(form);

    if (form.method.toUpperCase() === 'GET') {
      this._handleGet(body, this._getGetPath(form));
    } else {
      this._handlePost(body, this._getPostPath(form), form.method);
    }
  }

  private _handleGet(body: FormData, path: string) {
    const url = new URL(path, window.location.href);
    const params = new URLSearchParams(url.search);
    body.forEach((value, key) => {
      params.append(key, value instanceof File ? value.name : value);
    });
    url.search = params.toString();

    this._emitState('navigate');
    this._navigateTo(url);
  }

  private async _handlePost(body: FormData, path: string, method: string) {
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

  private _getExplicitAction(form: HTMLFormElement) {
    const explicitAction =
      this.action().trim() || form.getAttribute('action')?.trim();
    return explicitAction || undefined;
  }

  private _getGetPath(form: HTMLFormElement) {
    return this._getExplicitAction(form) ?? this.router.url;
  }

  private _getPostPath(form: HTMLFormElement) {
    const explicitAction = this._getExplicitAction(form);
    if (explicitAction) {
      return new URL(explicitAction, window.location.href).toString();
    }

    const snapshot = this.route.snapshot;
    if (snapshot.routeConfig && ANALOG_META_KEY in snapshot.routeConfig) {
      return runInInjectionContext(this.injector, () =>
        injectRouteEndpointURL(snapshot),
      ).pathname;
    }

    return `/api/_analog/pages${window.location.pathname}`;
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
