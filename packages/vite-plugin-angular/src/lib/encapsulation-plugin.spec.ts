import { describe, expect, it } from 'vitest';
import {
  encapsulationPlugin,
  isComponentStyleSheet,
} from './encapsulation-plugin.js';

const transform = (code: string, id: string) =>
  (encapsulationPlugin().transform as any)(code, id) as
    | { code: string }
    | undefined;

describe('encapsulationPlugin', () => {
  it.each([2, 3])(
    'recognizes Angular bare ngcomp queries for encapsulation %s',
    (encapsulation) => {
      expect(
        isComponentStyleSheet(`/abc.css?direct&ngcomp&e=${encapsulation}`),
      ).toBe(true);
      expect(isComponentStyleSheet('/abc.css?unrelated=ngcomp')).toBe(false);
    },
  );
  it('rewrites :host for emulated component stylesheet requests', () => {
    const result = transform(
      ':host { display: block; }',
      '/abc123.css?direct&ngcomp=ng-c1&e=0',
    );

    expect(result?.code).toContain('[_nghost-ng-c1]');
    expect(result?.code).not.toContain(':host');
  });

  it('leaves requests without a component id untouched', () => {
    expect(transform(':host { display: block; }', '/abc123.css')).toBe(
      undefined,
    );
    expect(
      transform(':host { display: block; }', '/abc123.css?ngcomp=ng-c1&e=2'),
    ).toBe(undefined);
  });
});
