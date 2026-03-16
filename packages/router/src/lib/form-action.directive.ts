import {
  Directive,
  inject,
  input,
  InputSignal,
  output,
  OutputEmitterRef,
} from '@angular/core';
import { ActivatedRoute, Params, Router } from '@angular/router';

import { injectRouteEndpointURL } from './inject-route-endpoint-url';

@Directive({
  // eslint-disable-next-line @angular-eslint/directive-selector
  selector: 'form[action],form[method]',
  host: {
    '(submit)': `submitted($event)`,
  },
  standalone: true,
})
export class FormAction {
  action: InputSignal<string> = input<string>('');
  // eslint-disable-next-line @angular-eslint/no-output-on-prefix
  onSuccess: OutputEmitterRef<unknown> = output<unknown>();
  // eslint-disable-next-line @angular-eslint/no-output-on-prefix
  onError: OutputEmitterRef<unknown> = output<unknown>();
  state: OutputEmitterRef<
    'submitting' | 'error' | 'redirect' | 'success' | 'navigate'
  > = output<'submitting' | 'error' | 'redirect' | 'success' | 'navigate'>();
  private router: Router = inject(Router);
  private route: ActivatedRoute = inject(ActivatedRoute);
  private path: string = this._getPath();

  submitted($event: any): void {
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
          } else if (this._isJSON(res.headers.get('Content-type'))) {
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

  private _isJSON(contentType: string | null): boolean {
    const mime = contentType ? contentType.split(';') : [];
    const essence = mime[0];

    return essence === 'application/json';
  }
}
