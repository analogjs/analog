import {
  HttpClient,
  HttpHeaders,
  HttpRequest,
  HttpResponse,
} from '@angular/common/http';
import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  makeStateKey,
  output,
  signal,
  TransferState,
} from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { ActivatedRoute } from '@angular/router';
import { injectBaseURL } from '@analogjs/router/tokens';
import { catchError, map, of, throwError } from 'rxjs';

import { makeCacheKey } from './cache-key';

type ServerProps = Record<string, any>;
type ServerOutputs = Record<string, any>;

/**
 * @description
 * Component that defines the bridge between the client and server-only
 * components. The component passes the component ID and props to the server
 * and retrieves the rendered HTML and outputs from the server-only component.
 *
 * Status: experimental
 */
@Component({
  selector: 'server-only,ServerOnly,Server',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <div [innerHTML]="content()"></div> `,
})
export class ServerOnly {
  component = input.required<string>();
  props = input<ServerProps>();
  outputs = output<ServerOutputs>();
  private http = inject(HttpClient);
  private sanitizer = inject(DomSanitizer);
  protected content = signal<SafeHtml>('');
  private route = inject(ActivatedRoute, { optional: true });
  private baseURL = injectBaseURL();
  private transferState = inject(TransferState);

  constructor() {
    effect(() => {
      const routeComponentId: string | undefined =
        this.route?.snapshot.data['component'];
      const props = this.props() || {};
      const componentId = routeComponentId || this.component();

      const headers = new HttpHeaders(
        new Headers({
          'Content-type': 'application/json',
          'X-Analog-Component': componentId,
        }),
      );

      const componentUrl = this.getComponentUrl(componentId);
      const httpRequest = new HttpRequest('POST', componentUrl, props, {
        headers,
      });
      const cacheKey = makeCacheKey(
        httpRequest,
        new URL(componentUrl).pathname,
      );
      const storeKey = makeStateKey<{ html: string; outputs: ServerOutputs }>(
        cacheKey,
      );
      const componentState = this.transferState.get<{
        html: string;
        outputs: ServerOutputs;
      } | null>(storeKey, null);

      if (componentState) {
        this.updateContent(componentState);
        this.transferState.remove(storeKey);
      } else {
        this.http
          .request(httpRequest)
          .pipe(
            map((response) => {
              if (response instanceof HttpResponse) {
                if (import.meta.env.SSR) {
                  this.transferState.set(storeKey, response.body);
                }

                return response.body as {
                  html: string;
                  outputs: ServerOutputs;
                };
              }
              return throwError(
                () => ({}) as { html: string; outputs: ServerOutputs },
              );
            }),
            catchError((error: unknown) => {
              console.log(error);
              return of({
                html: '',
                outputs: {} as ServerOutputs,
              });
            }),
          )
          .subscribe((content) =>
            this.updateContent(
              content as { html: string; outputs: ServerOutputs },
            ),
          );
      }
    });
  }

  updateContent(content: { html: string; outputs: ServerOutputs }) {
    this.content.set(this.sanitizer.bypassSecurityTrustHtml(content.html));
    this.outputs.emit(content.outputs);
  }

  getComponentUrl(componentId: string) {
    let baseURL = this.baseURL;

    if (!baseURL && typeof window !== 'undefined') {
      baseURL = window.location.origin;
    }

    return `${baseURL}/_analog/components/${componentId}`;
  }
}
