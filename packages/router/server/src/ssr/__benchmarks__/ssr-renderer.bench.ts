/**
 * Benchmarks comparing the string-based SSR renderer components
 * against equivalent Happy DOM / native DOM operations.
 *
 * Run with: npx vitest bench packages/router/server/src/ssr/__benchmarks__/
 */

import { bench, describe } from 'vitest';
import {
  ShimDocument,
  ShimElement,
  createDocument,
  parseHTML,
  serializeDocument,
} from '../dom-shim';
import { StringRendererFactory2 } from '../string-renderer';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const SIMPLE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Test</title>
  <base href="/">
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <app-root></app-root>
  <script type="module" src="/main.js"></script>
</body>
</html>`;

// Simulates a typical Angular component tree (~50 elements)
function buildComponentTree(
  doc: ShimDocument,
  depth: number,
  breadth: number,
): ShimElement {
  const root = doc.createElement('div');
  root.setAttribute('class', 'container');
  root.setAttribute('id', 'app');

  function buildLevel(parent: ShimElement, currentDepth: number) {
    if (currentDepth >= depth) return;
    for (let i = 0; i < breadth; i++) {
      const el = doc.createElement('div');
      el.setAttribute('class', `level-${currentDepth} item-${i}`);
      el.setAttribute('data-index', String(i));
      if (i % 3 === 0) {
        el.setAttribute('style', 'display: flex; align-items: center');
      }
      const text = doc.createTextNode(`Content ${currentDepth}-${i}`);
      el.appendChild(text);
      if (i % 2 === 0) {
        const comment = doc.createComment(`ng-container-${i}`);
        el.appendChild(comment);
      }
      parent.appendChild(el);
      buildLevel(el, currentDepth + 1);
    }
  }

  buildLevel(root, 0);
  return root;
}

// Simulates Angular component styles
const COMPONENT_STYLES = Array.from(
  { length: 20 },
  (_, i) =>
    `.component-${i} { display: block; padding: ${i}px; margin: ${i * 2}px; color: #${String(i).padStart(6, '0')}; font-size: ${12 + i}px; }`,
);

// A larger HTML string to parse (simulates SSR output)
function generateLargeHTML(elementCount: number): string {
  const parts = ['<div class="root">'];
  for (let i = 0; i < elementCount; i++) {
    parts.push(
      `<div class="item-${i}" data-id="${i}" style="color: red">`,
      `<span class="label">Item ${i}</span>`,
      `<p class="desc">Description for item ${i}</p>`,
      `<!--ng-${i}-->`,
      `</div>`,
    );
  }
  parts.push('</div>');
  return parts.join('');
}

// ---------------------------------------------------------------------------
// Benchmarks
// ---------------------------------------------------------------------------

describe('Document creation', () => {
  bench('createDocument from HTML template', () => {
    createDocument(SIMPLE_HTML);
  });
});

describe('HTML parsing', () => {
  const smallHTML = '<div class="a"><span>hello</span></div>';
  const mediumHTML = generateLargeHTML(20);
  const largeHTML = generateLargeHTML(100);

  bench('parseHTML - small (1 nested element)', () => {
    parseHTML(smallHTML, null);
  });

  bench('parseHTML - medium (20 items, ~100 elements)', () => {
    parseHTML(mediumHTML, null);
  });

  bench('parseHTML - large (100 items, ~500 elements)', () => {
    parseHTML(largeHTML, null);
  });
});

describe('DOM shim operations', () => {
  const doc = new ShimDocument();

  bench('createElement + setAttribute (x100)', () => {
    for (let i = 0; i < 100; i++) {
      const el = doc.createElement('div');
      el.setAttribute('class', `item-${i}`);
      el.setAttribute('id', `el-${i}`);
      el.setAttribute('data-value', String(i));
    }
  });

  bench('appendChild chain (100 elements deep)', () => {
    let parent = doc.createElement('div');
    for (let i = 0; i < 100; i++) {
      const child = doc.createElement('span');
      parent.appendChild(child);
      parent = child;
    }
  });

  bench(
    'build + serialize component tree (depth=4, breadth=3, ~120 nodes)',
    () => {
      const tree = buildComponentTree(doc, 4, 3);
      tree.outerHTML;
    },
  );
});

// Builds a synthetic Angular component tree against the given factory:
// 50 outer components, each with text + comment + 3 span children.
// ~250 elements total.
function buildAndRenderRendererTree(factory: any): void {
  const renderer = factory.createRenderer(null, null);
  const root = renderer.createElement('div', null);
  renderer.setAttribute(root, 'class', 'app-root');

  for (let i = 0; i < 50; i++) {
    const component = renderer.createElement('div', null);
    renderer.setAttribute(component, 'class', `component-${i}`);
    renderer.setAttribute(component, 'data-id', String(i));
    if (i % 2 === 0) renderer.addClass(component, 'even');
    renderer.setStyle(component, 'display', 'block');

    const text = renderer.createText(`Content ${i}`);
    renderer.appendChild(component, text);

    const comment = renderer.createComment('ng-container');
    renderer.appendChild(component, comment);

    for (let j = 0; j < 3; j++) {
      const child = renderer.createElement('span', null);
      renderer.setAttribute(child, 'class', 'child');
      const childText = renderer.createText(`Child ${j}`);
      renderer.appendChild(child, childText);
      renderer.appendChild(component, child);
    }

    renderer.appendChild(root, component);
  }

  factory.injectIntoDocument('app-root');
}

describe('String renderer token operations', () => {
  bench('full render cycle (50 components)', () => {
    const doc = createDocument(SIMPLE_HTML);
    const factory = new StringRendererFactory2(doc);
    buildAndRenderRendererTree(factory);
  });
});

// Build phase only (no serialization) — isolates per-element allocation cost
function buildRendererTreeOnly(factory: any): void {
  const renderer = factory.createRenderer(null, null);
  const root = renderer.createElement('div', null);
  renderer.setAttribute(root, 'class', 'app-root');

  for (let i = 0; i < 50; i++) {
    const component = renderer.createElement('div', null);
    renderer.setAttribute(component, 'class', `component-${i}`);
    renderer.setAttribute(component, 'data-id', String(i));
    if (i % 2 === 0) renderer.addClass(component, 'even');
    renderer.setStyle(component, 'display', 'block');

    const text = renderer.createText(`Content ${i}`);
    renderer.appendChild(component, text);
    const comment = renderer.createComment('ng-container');
    renderer.appendChild(component, comment);

    for (let j = 0; j < 3; j++) {
      const child = renderer.createElement('span', null);
      renderer.setAttribute(child, 'class', 'child');
      renderer.appendChild(child, renderer.createText(`Child ${j}`));
      renderer.appendChild(component, child);
    }

    renderer.appendChild(root, component);
  }
}

describe('String renderer build-only (no serialize)', () => {
  const doc = createDocument(SIMPLE_HTML);

  bench('build-only', () => {
    const factory = new StringRendererFactory2(doc);
    buildRendererTreeOnly(factory);
  });
});

describe('String renderer serialize-only', () => {
  // Pre-build the tree once; the bench measures pure serialize
  const doc = createDocument(SIMPLE_HTML);
  const factory = new StringRendererFactory2(doc);
  buildRendererTreeOnly(factory);

  bench('serialize-only', () => {
    factory.getRenderedHTML();
  });
});

describe('Document serialization', () => {
  const doc = createDocument(SIMPLE_HTML);
  // Add some content to body
  const appRoot = doc.querySelector('app-root')!;
  const tree = buildComponentTree(doc, 3, 4);
  appRoot.appendChild(tree);

  // Add styles to head
  for (const style of COMPONENT_STYLES.slice(0, 10)) {
    const styleEl = doc.createElement('style');
    styleEl.appendChild(doc.createTextNode(style));
    doc.head.appendChild(styleEl);
  }

  bench('serializeDocument (full page with ~80 elements + 10 styles)', () => {
    serializeDocument(doc);
  });
});

describe('innerHTML round-trip (parse + serialize)', () => {
  const html = generateLargeHTML(50);

  bench('set innerHTML + read outerHTML (~250 elements)', () => {
    const doc = new ShimDocument();
    const el = doc.createElement('div');
    el.innerHTML = html;
    el.outerHTML;
  });
});

describe('querySelector', () => {
  const doc = createDocument(SIMPLE_HTML);
  const appRoot = doc.querySelector('app-root')!;
  const tree = buildComponentTree(doc, 4, 3);
  appRoot.appendChild(tree);

  bench('querySelector by tag', () => {
    doc.querySelector('div');
  });

  bench('querySelector by id', () => {
    doc.querySelector('#app');
  });

  bench('querySelector by class', () => {
    doc.querySelector('.level-2');
  });
});
