// @vitest-environment node
import '@angular/platform-server/init';
import {
  INITIAL_CONFIG,
  PlatformState,
  platformServer,
} from '@angular/platform-server';
import { expect, it } from 'vitest';
import { createStreamShell } from './stream-shell';

it('preloads modules without executing them or changing the authoritative document', () => {
  const html =
    '<!doctype html><html><head><title>Fixture</title>' +
    '<script type="module" src="/main.js" crossorigin nonce="fixture-nonce"></script>' +
    '<script type="module">window.inlineModule = true;</script>' +
    '<script>window.ordinaryScript = true;</script></head>' +
    '<body data-theme="light"><app-root></app-root></body></html>';
  const platform = platformServer([
    {
      provide: INITIAL_CONFIG,
      useValue: { document: html, url: 'http://fixture.test' },
    },
  ]);
  try {
    const state = platform.injector.get(PlatformState);
    const before = state.renderToString();
    const shell = createStreamShell(platform);
    expect(shell).toContain('rel="modulepreload"');
    expect(shell).toContain('href="/main.js"');
    expect(shell).toContain('nonce="fixture-nonce"');
    expect(shell).not.toContain('type="module"');
    expect(shell).not.toContain('inlineModule');
    expect(shell).toContain('ordinaryScript');
    expect(shell).toContain('<body data-theme="light">');
    expect(shell).not.toContain('<app-root>');
    expect(state.renderToString()).toBe(before);
  } finally {
    platform.destroy();
  }
});
