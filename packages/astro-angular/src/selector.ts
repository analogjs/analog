/**
 * A CSS selector in the shape Angular's compiler uses for `ng-content` and
 * `ngProjectAs` matching. Ported from `CssSelector` in `@angular/compiler`.
 */
export interface ParsedSelector {
  element: string;
  attrs: [string, string][];
  classNames: string[];
  notSelectors: ParsedSelector[];
}

const SELECTOR_REGEXP = new RegExp(
  '(\\:not\\()|' + // 1: ":not("
    '(([\\.\\#]?)[-\\w]+)|' + // 2: "tag"; 3: "."/"#"
    '(?:\\[([-.\\w*\\\\$]+)(?:=(["\']?)([^\\]"\']*)\\5)?\\])|' + // 4: attribute; 5: quote; 6: value
    '(\\))|' + // 7: ")"
    '(\\s*,\\s*)', // 8: ","
  'g',
);

const NOT = 1;
const TAG = 2;
const PREFIX = 3;
const ATTRIBUTE = 4;
const ATTRIBUTE_VALUE = 6;
const NOT_END = 7;
const SEPARATOR = 8;

function createSelector(): ParsedSelector {
  return { element: '', attrs: [], classNames: [], notSelectors: [] };
}

export function parseSelectorList(selector: string): ParsedSelector[] {
  const results: ParsedSelector[] = [];
  let cssSelector = createSelector();
  let current = cssSelector;
  let inNot = false;
  let match: RegExpExecArray | null;

  const regexp = new RegExp(SELECTOR_REGEXP.source, 'g');

  while ((match = regexp.exec(selector))) {
    if (match[NOT]) {
      inNot = true;
      current = createSelector();
      cssSelector.notSelectors.push(current);
    }

    const tag = match[TAG];
    if (tag) {
      const prefix = match[PREFIX];
      if (prefix === '#') {
        current.attrs.push(['id', tag.slice(1)]);
      } else if (prefix === '.') {
        current.classNames.push(tag.slice(1).toLowerCase());
      } else {
        current.element = tag;
      }
    }

    const attribute = match[ATTRIBUTE];
    if (attribute) {
      current.attrs.push([attribute, match[ATTRIBUTE_VALUE] ?? '']);
    }

    if (match[NOT_END]) {
      inNot = false;
      current = cssSelector;
    }

    if (match[SEPARATOR]) {
      results.push(cssSelector);
      cssSelector = current = createSelector();
    }
  }

  results.push(cssSelector);

  return results;
}

/**
 * Structural equality, matching how Angular compares an `ngProjectAs` selector
 * against the selectors of an `ng-content`.
 */
export function isSameSelector(a: ParsedSelector, b: ParsedSelector): boolean {
  return (
    normalizeElement(a.element) === normalizeElement(b.element) &&
    a.attrs.length === b.attrs.length &&
    a.attrs.every(([name, value], i) => {
      const [otherName, otherValue] = b.attrs[i];
      return name === otherName && value === otherValue;
    }) &&
    a.classNames.length === b.classNames.length &&
    a.classNames.every((name, i) => name === b.classNames[i]) &&
    a.notSelectors.length === b.notSelectors.length &&
    a.notSelectors.every((not, i) => isSameSelector(not, b.notSelectors[i]))
  );
}

function normalizeElement(element: string): string {
  return element === '*' ? '' : element;
}
