import { encapsulateStyle } from '@angular/compiler';
import { Plugin } from 'vite';

/**
 * Analog liveReload (`externalRuntimeStyles`) serves component styles as
 * `<link>` URLs with `ngcomp` / `e` query params. Vite compiles those files
 * through its CSS pipeline (SCSS → CSS → `const __vite__css = "..."`).
 *
 * The main Angular transform cannot encapsulate them: its filter is
 * TypeScript-only, and encapsulation must run *after* preprocessors so
 * `:host` / `:host-context` survive Sass compilation. Without this plugin,
 * `:host` is invalid in a document stylesheet and the layout collapses.
 */
export function encapsulateComponentStylesPlugin(): Plugin {
  return {
    name: 'analogjs-encapsulate-component-styles',
    apply: 'serve',
    enforce: 'post',
    transform(code, id) {
      if (!isComponentStyleSheet(id)) {
        return null;
      }

      const { encapsulation, componentId } = getComponentStyleSheetMeta(id);
      if (encapsulation !== 'emulated' || !componentId) {
        return null;
      }

      return {
        code: encapsulateViteCssOutput(code, componentId),
        map: null,
      };
    },
  };
}

export function isComponentStyleSheet(id: string): boolean {
  return id.includes('ngcomp=');
}

/**
 * Removes the leading `/` and query string from a url path.
 * e.g. `/foo.scss?direct&ngcomp=ng-c3153525609&e=0` returns `foo.scss`
 */
export function getFilenameFromPath(id: string): string {
  return new URL(id, 'http://localhost').pathname.replace(/^\//, '');
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
