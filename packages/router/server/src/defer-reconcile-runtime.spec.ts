import { beforeEach, describe, expect, it } from 'vitest';
import { DEFER_RECONCILE_RUNTIME } from './defer-reconcile-runtime';

// Install the runtime's window globals by evaluating the emitted IIFE, exactly
// as the browser would when it parses the streamed <script>.
function installRuntime() {
  new Function(DEFER_RECONCILE_RUNTIME)();
}

type Runtime = {
  __analogPaint: (id: string) => void;
  __analogReconcileHead: () => void;
  __analogFinalize: () => void;
};
const rt = () => window as unknown as Runtime;

describe('DEFER_RECONCILE_RUNTIME', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    installRuntime();
  });

  describe('__analogPaint', () => {
    it('paints a streamed block into the live region and removes the template', () => {
      document.body.innerHTML =
        '<div data-analog-stream></div>' +
        '<template data-analog-defer="s0"><p class="a">A</p></template>';

      rt().__analogPaint('s0');

      const region = document.querySelector('[data-analog-stream]')!;
      expect(region.querySelector('.a')?.textContent).toBe('A');
      expect(
        document.querySelector('template[data-analog-defer="s0"]'),
      ).toBeNull();
    });
  });

  describe('__analogReconcileHead', () => {
    it('applies the authoritative title, upserts meta idempotently, then removes the template', () => {
      document.head.innerHTML =
        '<title>Shell</title>' +
        '<meta charset="utf-8">' +
        '<meta name="description" content="old">';
      document.body.innerHTML =
        '<template data-analog-head>' +
        '<title>Resolved</title>' +
        '<meta charset="utf-8">' +
        '<meta name="description" content="new">' +
        '<meta property="og:title" content="OG">' +
        '</template>';

      rt().__analogReconcileHead();

      expect(document.title).toBe('Resolved');
      // existing description updated in place, not duplicated
      const descs = document.head.querySelectorAll('meta[name="description"]');
      expect(descs.length).toBe(1);
      expect(descs[0].getAttribute('content')).toBe('new');
      // new meta appended
      expect(
        document.head
          .querySelector('meta[property="og:title"]')
          ?.getAttribute('content'),
      ).toBe('OG');
      // charset not duplicated
      expect(document.head.querySelectorAll('meta[charset]').length).toBe(1);
      // template cleaned up
      expect(document.querySelector('template[data-analog-head]')).toBeNull();
    });

    it('is a no-op when there is no head template', () => {
      document.head.innerHTML = '<title>Shell</title>';
      expect(() => rt().__analogReconcileHead()).not.toThrow();
      expect(document.title).toBe('Shell');
    });
  });

  describe('__analogFinalize', () => {
    it('swaps the body to the authoritative document', () => {
      document.body.innerHTML =
        '<div data-analog-stream></div>' +
        '<template data-analog-authoritative><main id="app">hi</main></template>';

      rt().__analogFinalize();

      expect(document.querySelector('[data-analog-stream]')).toBeNull();
      expect(document.getElementById('app')?.textContent).toBe('hi');
    });
  });
});
