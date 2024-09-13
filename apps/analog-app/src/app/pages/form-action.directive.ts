import { Directive, inject, input, output } from '@angular/core';
import { Params, Router } from '@angular/router';

export type ActionResult = {
  type: string;
};

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
  router = inject(Router);

  submitted($event: { target: HTMLFormElement } & Event) {
    this.state.emit('submitting');
    $event.preventDefault();
    const body = new FormData($event.target);
    const path = window.location.pathname;

    if ($event.target.method.toUpperCase() === 'GET') {
      const params: Params = {};
      body.forEach((formVal, formKey) => {
        params[formKey] = formVal;
      });
      this.state.emit('navigate');
      this.router.navigate([path], {
        queryParams: params,
        onSameUrlNavigation: 'reload',
      });
    } else {
      fetch(this.action() || `/api/_analog/pages${path}`, {
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
                this.onSuccess.emit('success');
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
  }
}
