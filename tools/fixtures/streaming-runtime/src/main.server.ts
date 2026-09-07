import '@angular/platform-server/init';
import {
  DestroyRef,
  inject,
  provideAppInitializer,
  provideZoneChangeDetection,
  provideZonelessChangeDetection,
} from '@angular/core';
import {
  provideClientHydration,
  withIncrementalHydration,
} from '@angular/platform-browser';
import { provideServerRendering } from '@angular/platform-server';
import { renderStream } from '@analogjs/router/server';
import type { ServerContext } from '@analogjs/router/tokens';
import { App } from './app/app';
import { probe, PROBE_ID } from './app/probe';

export default function render(
  url: string,
  document: string,
  context: ServerContext,
) {
  const id =
    new URL(url, 'https://fixture.test').searchParams.get('id') ?? 'normal';
  return renderStream(App, {
    providers: [
      provideServerRendering(),
      'Zone' in globalThis
        ? provideZoneChangeDetection()
        : provideZonelessChangeDetection(),
      provideClientHydration(withIncrementalHydration()),
      { provide: PROBE_ID, useValue: id },
      provideAppInitializer(() => {
        const record = probe(id);
        record.started++;
        inject(DestroyRef).onDestroy(() => record.destroyed++);
        if (id.startsWith('failure')) {
          return new Promise<void>((_resolve, reject) =>
            setTimeout(
              () => reject(new Error('private-stream-fixture-error')),
              80,
            ),
          );
        }
      }),
    ],
  })(url, document, context);
}
