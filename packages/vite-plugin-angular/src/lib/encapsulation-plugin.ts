import * as ngCompiler from '@angular/compiler';
import { Plugin } from 'vite';
import { debugStylesV } from './utils/debug.js';

export function isComponentStyleSheet(id: string): boolean {
  return id.includes('ngcomp=');
}

export function getComponentStyleSheetMeta(id: string): {
  componentId: string;
  encapsulation: 'emulated' | 'shadow' | 'none';
} {
  const params = new URL(id, 'http://localhost').searchParams;
  const encapsulationMapping = {
    '0': 'emulated',
    '2': 'none',
    '3': 'shadow',
  };
  return {
    componentId: params.get('ngcomp')!,
    encapsulation: encapsulationMapping[
      params.get('e') as keyof typeof encapsulationMapping
    ] as 'emulated' | 'shadow' | 'none',
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
          const encapsulated = ngCompiler.encapsulateStyle(code, componentId);
          return {
            code: encapsulated,
            map: null,
          };
        }
      }
    },
  };
}
