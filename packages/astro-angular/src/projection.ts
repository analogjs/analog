import type { ComponentMirror } from '@angular/core';
import { isSameSelector, parseSelectorList } from './selector.ts';

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;
const SHOW_COMMENT = 128;

const MARKER_PREFIX = 'analog-slot:';

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
  // As in Angular, unmatched content goes to the last default slot.
  const wildcardIndex = selectors.lastIndexOf('*');

  for (const node of parseSlots(slots, document)) {
    // Angular drops whitespace-only text nodes between elements at compile
    // time, so projecting them would only suppress `ng-content` fallbacks.
    if (node.nodeType === TEXT_NODE && !node.textContent?.trim()) {
      continue;
    }

    const matched = selectors.findIndex(
      (selector) => selector !== '*' && matches(node, selector),
    );
    const target = matched > -1 ? matched : wildcardIndex;

    if (target > -1) {
      projectableNodes[target].push(node);
    }
  }

  return projectableNodes;
}

/**
 * Wraps each non-empty slot in comment markers, so the client can find the
 * server-rendered nodes again when hydrating. Angular reuses the DOM during
 * hydration, so it must be handed those nodes rather than freshly parsed ones.
 * @param projectableNodes The distributed nodes, see `buildProjectableNodes`
 * @param appId The island's APP_ID, to keep markers apart from nested islands
 * @param document The document the component is rendered into
 */
export function markProjectableNodes(
  projectableNodes: Node[][],
  appId: string,
  document: Document,
): Node[][] {
  return projectableNodes.map((nodes, index) =>
    nodes.length
      ? [
          document.createComment(`${MARKER_PREFIX}${appId}:${index}`),
          ...nodes,
          document.createComment(`/${MARKER_PREFIX}${appId}:${index}`),
        ]
      : nodes,
  );
}

/**
 * Collects the server-rendered projected nodes from the host element using the
 * markers added by `markProjectableNodes`.
 * @returns The nodes per slot, or `undefined` when the host carries no markers
 */
export function collectProjectedNodes(
  hostElement: Element,
  mirror: ComponentMirror<unknown>,
  appId: string,
): Node[][] | undefined {
  const selectors = mirror.ngContentSelectors;

  if (!selectors.length) {
    return undefined;
  }

  const projectableNodes: Node[][] = selectors.map(() => []);
  const walker = hostElement.ownerDocument.createTreeWalker(
    hostElement,
    SHOW_COMMENT,
  );
  let found = false;

  for (let start = walker.nextNode(); start; start = walker.nextNode()) {
    const match = start.textContent?.startsWith(`${MARKER_PREFIX}${appId}:`)
      ? Number(start.textContent.slice(`${MARKER_PREFIX}${appId}:`.length))
      : NaN;

    if (Number.isNaN(match) || match >= selectors.length) {
      continue;
    }

    const end = `/${MARKER_PREFIX}${appId}:${match}`;
    const nodes: Node[] = [start];
    let node = start.nextSibling;

    while (
      node &&
      !(node.nodeType === COMMENT_NODE && node.textContent === end)
    ) {
      nodes.push(node);
      node = node.nextSibling;
    }

    if (node) {
      nodes.push(node);
    }

    projectableNodes[match] = nodes;
    found = true;
  }

  return found ? projectableNodes : undefined;
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
  const projectAs = element.getAttribute('ngProjectAs');

  // As in Angular, `ngProjectAs` replaces the element's own selector and is
  // compared structurally against the `select` list.
  if (projectAs !== null) {
    const [alias] = parseSelectorList(projectAs);
    return parseSelectorList(selector).some((candidate) =>
      isSameSelector(alias, candidate),
    );
  }

  try {
    return element.matches(selector);
  } catch {
    // `ngContentSelectors` may contain selectors that `matches()` rejects.
    return false;
  }
}
