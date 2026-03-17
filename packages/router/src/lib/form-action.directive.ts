import { Directive, inject, input, output, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { injectRouteEndpointURL } from './inject-route-endpoint-url';

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
  onSuccess = output<unknown>();
  onError = output<unknown>();
  onStateChange = output<FormActionState>();
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  protected currentState = signal<FormActionState | 'idle'>('idle');
  /** Cached during construction (injection context) so inject() works. */
  private _endpointUrl = this.route
    ? injectRouteEndpointURL(this.route.snapshot)
    : undefined;

  submitted($event: any): void {
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

  private _handlePost(body: FormData, path: string, method: string) {
    fetch(path, {
      method,
      body,
    })
      .then((res) => {
        if (res.ok) {
          if (res.redirected) {
            this._emitState('redirect');
            this._navigateTo(new URL(res.url, window.location.href));
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

    if (this._endpointUrl) {
      return this._endpointUrl.pathname;
    }

    return `/api/_analog/pages${window.location.pathname}`;
  }

  private _emitState(state: FormActionState) {
    this.currentState.set(state);
    this.onStateChange.emit(state);
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
