import { runInInjectionContext, type PlatformRef } from '@angular/core';
import { PlatformState } from '@angular/platform-server';

/** Preload bootstrap modules, but leave execution to the authoritative tail. */
export function createStreamShell(platform: PlatformRef): string {
  const state = platform.injector.get(PlatformState);
  const document = (state.getDocument() as Document).cloneNode(
    true,
  ) as Document;
  for (const script of Array.from(
    document.head.querySelectorAll('script[type="module"]'),
  )) {
    const src = script.getAttribute('src');
    if (src) {
      const preload = document.createElement('link');
      preload.setAttribute('rel', 'modulepreload');
      preload.setAttribute('href', src);
      for (const name of [
        'crossorigin',
        'integrity',
        'referrerpolicy',
        'nonce',
        'fetchpriority',
      ]) {
        const value = script.getAttribute(name);
        if (value !== null) preload.setAttribute(name, value);
      }
      script.parentNode!.replaceChild(preload, script);
    } else {
      script.parentNode!.removeChild(script);
    }
  }
  while (document.body.firstChild)
    document.body.removeChild(document.body.firstChild);
  const html = runInInjectionContext(platform.injector, () =>
    new PlatformState(document).renderToString(),
  );
  return html.slice(0, html.lastIndexOf('</body>'));
}
