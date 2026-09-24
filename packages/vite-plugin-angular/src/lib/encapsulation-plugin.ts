import { encapsulateStyle } from '@angular/compiler';
import { Plugin } from 'vite';
import { debugStylesV } from './utils/debug.js';

export function isComponentStyleSheet(id: string): boolean {
  return id.includes('ngcomp=');
}

export function getComponentStyleSheetMeta(id: string): {
  componentId: string;
  encapsulation: 'emulated' | 'shadow' | 'none' | undefined;
} {
  const queryIndex = id.indexOf('?');
  const params = new URLSearchParams(
    queryIndex === -1 ? '' : id.slice(queryIndex + 1),
  );
  const encapsulationMapping = {
    '0': 'emulated',
    '2': 'none',
    '3': 'shadow',
  } as const;
  const encapsulationKey = params.get('e') as
    | keyof typeof encapsulationMapping
    | null;

  return {
    // Angular component IDs may contain `^`. Vite ids sometimes keep the
    // percent-encoded form (`%5E`) even after query parsing.
    componentId: (params.get('ngcomp') ?? '').replaceAll('%5E', '^'),
    encapsulation: encapsulationKey
      ? encapsulationMapping[encapsulationKey]
      : undefined,
  };
}

/**
 * Encapsulation runs in enforce: 'post' so that @tailwindcss/vite
 * (enforce: 'pre') fully resolves @apply directives — including those
 * inside :host {} — before Angular's ShadowCss rewrites selectors.
 * (#2293)
 *
 * The `ngcomp=` query only appears on requests Angular's runtime makes for
 * externalized component styles, so it is the only gate needed. This plugin
 * is shared by the ngtsc and Angular Compilation API paths and must not
 * depend on either path's private state.
 */
export function encapsulationPlugin(): Plugin {
  return {
    name: '@analogjs/vite-plugin-angular:encapsulation',
    enforce: 'post',
    transform(code: string, id: string) {
      if (isComponentStyleSheet(id)) {
        const { encapsulation, componentId } = getComponentStyleSheetMeta(id);
        if (encapsulation === 'emulated' && componentId) {
          debugStylesV('applying emulated view encapsulation (post)', {
            stylesheet: id.split('?')[0],
            componentId,
          });
          const encapsulated = encapsulateViteCssOutput(code, componentId);
          return {
            code: encapsulated,
            map: null,
          };
        }
      }
    },
  };
}

/**
 * Encapsulate either a Vite CSS JS module (`const __vite__css = "..."`)
 * or a raw CSS string produced by `?direct` stylesheet requests.
 */
export function encapsulateViteCssOutput(
  code: string,
  componentId: string,
): string {
  const VITE_CSS_CONST_RE = /const __vite__css\s*=\s*("(?:\\.|[^"\\])*")/;
  const match = VITE_CSS_CONST_RE.exec(code);
  if (match) {
    const css = JSON.parse(match[1]) as string;
    const encapsulated = encapsulateStyle(css, componentId);
    return (
      code.slice(0, match.index) +
      `const __vite__css = ${JSON.stringify(encapsulated)}` +
      code.slice(match.index + match[0].length)
    );
  }

  return encapsulateStyle(code, componentId);
}
