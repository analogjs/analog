import { Directive, inject, input, output } from '@angular/core';
import { ActivatedRoute, Params, Router } from '@angular/router';

import { injectRouteEndpointURL } from './inject-route-endpoint-url';

@Directive({
  selector: 'form[action],form[method]',
  host: {
    '(submit)': `submitted($event)`,
  },
  standalone: true,
})
export class FormAction {
  action = input<string>('');
  onSuccess = output<unknown>();
  onError = output<unknown>();
  state = output<
    'submitting' | 'error' | 'redirect' | 'success' | 'navigate'
  >();
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private path = this._getPath();

  submitted($event: { target: HTMLFormElement } & Event) {
    $event.preventDefault();

    this.state.emit('submitting');
    const body = new FormData($event.target);

    if ($event.target.method.toUpperCase() === 'GET') {
      this._handleGet(body, this.router.url);
    } else {
      this._handlePost(body, this.path, $event);
    }
  }

  private _handleGet(body: FormData, path: string) {
    const params: Params = {};
    body.forEach((formVal, formKey) => (params[formKey] = formVal));

    this.state.emit('navigate');
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
            this.state.emit('redirect');
            this.router.navigate([redirectUrl]);
          } else if (res.headers.get('Content-type') === 'application/json') {
            res.json().then((result) => {
              this.onSuccess.emit(result);
              this.state.emit('success');
            });
          } else {
            res.text().then((result) => {
              this.onSuccess.emit(result);
              this.state.emit('success');
            });
          }
        } else {
          if (res.headers.get('X-Analog-Errors')) {
            res.json().then((errors: unknown) => {
              this.onError.emit(errors);
              this.state.emit('error');
            });
          } else {
            this.state.emit('error');
          }
        }
      })
      .catch((_) => {
        this.state.emit('error');
      });
  }

  private _getPath() {
    if (this.route) {
      return injectRouteEndpointURL(this.route.snapshot).pathname;
    }

    return `/api/_analog/pages${window.location.pathname}`;
  }
}
