import { Directive, inject, input, output } from '@angular/core';
import { Router } from '@angular/router';

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
export class FormActionDirective {
  action = input<string>('');
  onSuccess = output<unknown>();
  onError = output<unknown>();
  state = output<'submitting' | 'error'>();
  router = inject(Router);

  submitted($event: { target: HTMLFormElement } & Event) {
    $event.preventDefault();
    const body = new FormData($event.target);

    fetch(this.action() || `/api/_analog/pages${window.location.pathname}`, {
      method: $event.target.method,
      body,
    }).then((res) => {
      if (res.ok) {
        res.json().then((result) => this.onSuccess.emit(result));
      } else if (res.headers.get('X-Analog-Redirect')) {
        const redirectUrl = res.headers.get('X-Analog-Redirect') as string;
        this.router.navigateByUrl(redirectUrl);
      } else if (res.headers.get('X-Analog-Errors')) {
        res.json().then((errors: unknown) => this.onError.emit(errors));
      }
    });
  }
}
