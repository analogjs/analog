import { VERSION } from '@angular/compiler-cli';
import { Plugin } from 'vite';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function eventReplayPlugin(): Plugin {
  return {
    name: 'analogjs-event-replay-plugin',
    async transformIndexHtml() {
      const eventReplayScript = await readFile(
        require.resolve('@angular/core/event-dispatch-contract.min.js'),
        'utf-8'
      );

      return [
        {
          tag: 'script',
          attrs: {
            type: 'text/javascript',
            id: 'ng-event-dispatch-contract',
          },
          children: eventReplayScript,
          injectTo: 'body',
        },
      ];
    },
  };
}

export function injectHTMLPlugin(): Plugin[] {
  const hasEventReplay = Number(VERSION.major) >= 18;

  return hasEventReplay ? [eventReplayPlugin()] : [];
}
