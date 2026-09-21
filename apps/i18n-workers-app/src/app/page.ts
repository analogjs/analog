import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  injectLocale,
  injectRequest,
  injectResponse,
} from '@analogjs/router/tokens';
import type { RouteMeta } from '@analogjs/router';
let active = 0;
export const routeMeta: RouteMeta = {
  resolve: {
    message: async () => {
      const req = injectRequest();
      const res = injectResponse();
      const params = new URL(req?.url || '/', 'http://localhost').searchParams;
      const concurrent = ++active;
      await new Promise((resolve) => setTimeout(resolve, 40));
      active--;
      if (params.has('fail')) throw new Error('Intentional resolver failure');
      if (res) {
        res.setHeader('x-active-renders', concurrent);
        res.setHeader(
          'x-request-id',
          String(req?.headers['x-request-id'] || ''),
        );
        res.setHeader('set-cookie', ['first=1; Path=/', 'second=2; Path=/']);
      }
      return { message: $localize`:@@code:Espanol code`, active: concurrent };
    },
  },
};
@Component({
  template: `<h2 id="late" i18n="@@late">Espanol late</h2>
    <p id="code">{{ result.message }}</p>
    <p id="active">{{ result.active }}</p>
    <a [href]="'/' + locale + '/prerender/crawled'">Crawled page</a>`,
})
export default class Page {
  result = inject(ActivatedRoute).snapshot.data['message'];
  locale = injectLocale();
}
