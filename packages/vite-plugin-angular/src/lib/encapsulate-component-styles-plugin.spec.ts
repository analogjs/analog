import { describe, expect, it } from 'vitest';
import type { Plugin } from 'vite';
import { encapsulateStyle } from '@angular/compiler';
import { angular } from './angular-vite-plugin';
import {
  encapsulateComponentStylesPlugin,
  encapsulateViteCssOutput,
  getComponentStyleSheetMeta,
  getFilenameFromPath,
  isComponentStyleSheet,
} from './encapsulate-component-styles-plugin';

const HOST_CSS = ':host { display: block; }\n.wrapper { color: red; }';
const COMPONENT_ID = 'ng-c3153525609';
const EMULATED_ID = `/src/app/card.component.scss?direct&ngcomp=${COMPONENT_ID}&e=0`;

function runTransform(plugin: Plugin, code: string, id: string) {
  const hook = plugin.transform;
  if (!hook) {
    throw new Error('expected transform hook');
  }
  const handler = typeof hook === 'function' ? hook : hook.handler;
  return handler.call({} as ThisParameterType<typeof handler>, code, id);
}

describe('component stylesheet id helpers', () => {
  it('detects liveReload component stylesheet ids', () => {
    expect(isComponentStyleSheet(EMULATED_ID)).toBe(true);
    expect(isComponentStyleSheet('/src/app/card.component.scss')).toBe(false);
    expect(isComponentStyleSheet('/src/app/card.component.ts')).toBe(false);
  });

  it('strips the query string and leading slash from a stylesheet path', () => {
    expect(getFilenameFromPath(EMULATED_ID)).toBe(
      'src/app/card.component.scss',
    );
  });

  it('maps Angular ViewEncapsulation numbers from the e query param', () => {
    expect(getComponentStyleSheetMeta(EMULATED_ID)).toEqual({
      componentId: COMPONENT_ID,
      encapsulation: 'emulated',
    });
    expect(
      getComponentStyleSheetMeta(
        `/src/app/card.component.scss?ngcomp=${COMPONENT_ID}&e=2`,
      ),
    ).toEqual({
      componentId: COMPONENT_ID,
      encapsulation: 'none',
    });
    expect(
      getComponentStyleSheetMeta(
        `/src/app/card.component.scss?ngcomp=${COMPONENT_ID}&e=3`,
      ),
    ).toEqual({
      componentId: COMPONENT_ID,
      encapsulation: 'shadow',
    });
  });

  it('leaves encapsulation undefined when e is missing or unknown', () => {
    expect(
      getComponentStyleSheetMeta(
        `/src/app/card.component.scss?ngcomp=${COMPONENT_ID}`,
      ).encapsulation,
    ).toBeUndefined();
    expect(
      getComponentStyleSheetMeta(
        `/src/app/card.component.scss?ngcomp=${COMPONENT_ID}&e=9`,
      ).encapsulation,
    ).toBeUndefined();
  });

  it('decodes percent-encoded ^ in the Angular component id', () => {
    expect(
      getComponentStyleSheetMeta(
        '/src/app/card.component.scss?direct&ngcomp=ng%5Ec123&e=0',
      ).componentId,
    ).toBe('ng^c123');
    expect(
      getComponentStyleSheetMeta(
        '/src/app/card.component.scss?direct&ngcomp=ng%255Ec123&e=0',
      ).componentId,
    ).toBe('ng^c123');
  });
});

describe('encapsulateViteCssOutput', () => {
  it('rewrites :host in a Vite CSS JS module without touching surrounding code', () => {
    const input = [
      'import.meta.hot.accept();',
      `const __vite__css = ${JSON.stringify(HOST_CSS)}`,
      'export default __vite__css;',
    ].join('\n');

    const result = encapsulateViteCssOutput(input, COMPONENT_ID);
    const match = /const __vite__css = (".*")/.exec(result);

    expect(match).toBeTruthy();
    const css = JSON.parse(match![1]) as string;
    expect(css).toBe(encapsulateStyle(HOST_CSS, COMPONENT_ID));
    expect(css).not.toContain(':host {');
    expect(css).toContain(COMPONENT_ID);
    expect(result.startsWith('import.meta.hot.accept();\n')).toBe(true);
    expect(result.endsWith('export default __vite__css;')).toBe(true);
  });

  it('rewrites :host in raw CSS from a ?direct stylesheet request', () => {
    const result = encapsulateViteCssOutput(HOST_CSS, COMPONENT_ID);

    expect(result).toBe(encapsulateStyle(HOST_CSS, COMPONENT_ID));
    expect(result).not.toContain(':host {');
    expect(result).toContain('.wrapper');
  });
});

describe('encapsulateComponentStylesPlugin', () => {
  const plugin = encapsulateComponentStylesPlugin();

  it('runs after Vite CSS compilation and only during serve', () => {
    expect(plugin.name).toBe('analogjs-encapsulate-component-styles');
    expect(plugin.apply).toBe('serve');
    expect(plugin.enforce).toBe('post');
  });

  it('encapsulates emulated component styles so :host is valid CSS', () => {
    const code = `const __vite__css = ${JSON.stringify(HOST_CSS)}`;
    const result = runTransform(plugin, code, EMULATED_ID);

    expect(result).toEqual({
      code: encapsulateViteCssOutput(code, COMPONENT_ID),
      map: null,
    });
    expect(result).not.toBeNull();
    if (result && typeof result === 'object' && 'code' in result) {
      expect(result.code).not.toContain(':host {');
    }
  });

  it('leaves non-component CSS untouched', () => {
    expect(runTransform(plugin, HOST_CSS, '/src/styles.scss')).toBeNull();
  });

  it('skips ShadowDom and None encapsulation', () => {
    const noneId = `/src/app/card.component.scss?direct&ngcomp=${COMPONENT_ID}&e=2`;
    const shadowId = `/src/app/card.component.scss?direct&ngcomp=${COMPONENT_ID}&e=3`;

    expect(runTransform(plugin, HOST_CSS, noneId)).toBeNull();
    expect(runTransform(plugin, HOST_CSS, shadowId)).toBeNull();
  });

  it('skips stylesheets without a component id', () => {
    expect(
      runTransform(
        plugin,
        HOST_CSS,
        '/src/app/card.component.scss?ngcomp=&e=0',
      ),
    ).toBeNull();
  });
});

describe('angular() plugin composition', () => {
  it('registers the encapsulate plugin when liveReload is requested', () => {
    const plugins = angular({ liveReload: true });

    expect(
      plugins.some(
        (plugin) => plugin?.name === 'analogjs-encapsulate-component-styles',
      ),
    ).toBe(true);
  });

  it('does not register the encapsulate plugin by default', () => {
    const plugins = angular();

    expect(
      plugins.some(
        (plugin) => plugin?.name === 'analogjs-encapsulate-component-styles',
      ),
    ).toBe(false);
  });
});
