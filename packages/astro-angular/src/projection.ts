import type { ComponentMirror } from '@angular/core';

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

/**
 * Distributes the HTML Astro rendered for the component's slots across the
 * component's `<ng-content>` slots, using Angular's own selector semantics.
 *
 * The result is indexed to match `mirror.ngContentSelectors`. Angular does not
 * apply `select` matching to `projectableNodes`, so the matching happens here.
 * @param mirror The component mirror, to read the `ng-content` selectors
 * @param slots The slot HTML passed by Astro, keyed by slot name
 * @param document The document the component is rendered into
 * @returns The nodes to project, or `undefined` when the component has no `ng-content`
 */
export function buildProjectableNodes(
  mirror: ComponentMirror<unknown>,
  slots: unknown,
  document: Document,
): Node[][] | undefined {
  const selectors = mirror.ngContentSelectors;

  if (!selectors.length) {
    return undefined;
  }

  const projectableNodes: Node[][] = selectors.map(() => []);
  const wildcardIndex = selectors.indexOf('*');

  for (const node of parseSlots(slots, document)) {
    // Angular drops whitespace-only text nodes between elements at compile
    // time, so projecting them would only suppress `ng-content` fallbacks.
    if (node.nodeType === TEXT_NODE && !node.textContent?.trim()) {
      continue;
    }

    const matched = selectors.findIndex(
      (selector, index) => index !== wildcardIndex && matches(node, selector),
    );
    const target = matched > -1 ? matched : wildcardIndex;

    if (target > -1) {
      projectableNodes[target].push(node);
    }
  }

  return projectableNodes;
}

function parseSlots(slots: unknown, document: Document): Node[] {
  const html =
    slots && typeof slots === 'object'
      ? Object.values(slots).join('')
      : String(slots ?? '');

  if (!html) {
    return [];
  }

  const template = document.createElement('template');
  template.innerHTML = html;

  return Array.from(template.content.childNodes);
}

function matches(node: Node, selector: string): boolean {
  if (node.nodeType !== ELEMENT_NODE) {
    return false;
  }

  const element = node as Element;

  try {
    // As in Angular, `ngProjectAs` replaces the element's own selector.
    const projectAs = element.getAttribute('ngProjectAs');
    const subject = projectAs
      ? createProbe(projectAs, element.ownerDocument)
      : element;

    return subject.matches(selector);
  } catch {
    // `ngContentSelectors` may contain selectors that `matches()` rejects.
    return false;
  }
}

const SELECTOR_PART =
  /#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]/g;

// Builds an element matching the simple CSS selector held by `ngProjectAs`.
function createProbe(projectAs: string, document: Document): Element {
  const tag = /^[a-zA-Z][\w-]*/.exec(projectAs)?.[0];
  const probe = document.createElement(tag || 'div');

  for (const [, id, className, attr, value] of projectAs.matchAll(
    SELECTOR_PART,
  )) {
    if (id) {
      probe.id = id;
    } else if (className) {
      probe.classList.add(className);
    } else if (attr) {
      probe.setAttribute(attr, value ?? '');
    }
  }

  return probe;
}
