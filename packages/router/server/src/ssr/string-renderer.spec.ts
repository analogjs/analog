import { describe, expect, it } from 'vitest';

import { createDocument } from './dom-shim';
import { StringRendererFactory2, serializeTokenTree } from './string-renderer';

const TEMPLATE = `<!DOCTYPE html><html><head></head><body><app-root></app-root></body></html>`;

function setupRenderer() {
  const doc = createDocument(TEMPLATE);
  const factory = new StringRendererFactory2(doc);
  const renderer = factory.createRenderer(null, null);
  return { doc, factory, renderer };
}

describe('StringRenderer basic ops', () => {
  it('appends elements, text, and comments under the host', () => {
    const { factory, renderer, doc } = setupRenderer();
    const host = doc.querySelector('app-root');

    const div = renderer.createElement('div', null);
    renderer.setAttribute(div, 'class', 'x');
    renderer.appendChild(host, div);

    const text = renderer.createText('hi');
    renderer.appendChild(div, text);

    const comment = renderer.createComment('marker');
    renderer.appendChild(div, comment);

    factory.injectIntoDocument('app-root');

    expect(host?.innerHTML).toBe(`<div class="x">hi<!--marker--></div>`);
  });

  it('escapes user text by default', () => {
    const { factory, renderer, doc } = setupRenderer();
    const host = doc.querySelector('app-root');

    const span = renderer.createElement('span', null);
    renderer.appendChild(host, span);
    renderer.appendChild(span, renderer.createText('<script>x</script>'));

    factory.injectIntoDocument('app-root');

    expect(host?.innerHTML).toContain('&lt;script&gt;');
    expect(host?.innerHTML).not.toContain('<script>x');
  });

  it('passes innerHTML through unescaped', () => {
    const { factory, renderer, doc } = setupRenderer();
    const host = doc.querySelector('app-root');

    const div = renderer.createElement('div', null);
    renderer.appendChild(host, div);
    renderer.setProperty(div, 'innerHTML', '<b>bold</b>');

    factory.injectIntoDocument('app-root');

    expect(host?.innerHTML).toBe(`<div><b>bold</b></div>`);
  });

  it('merges classes and styles into attributes', () => {
    const { factory, renderer, doc } = setupRenderer();
    const host = doc.querySelector('app-root');

    const div = renderer.createElement('div', null);
    renderer.addClass(div, 'a');
    renderer.addClass(div, 'b');
    renderer.setStyle(div, 'color', 'red');
    renderer.appendChild(host, div);

    factory.injectIntoDocument('app-root');

    const out = host?.innerHTML ?? '';
    expect(out).toContain('class="a b"');
    expect(out).toContain('style="color: red"');
  });

  it('escapes attribute values', () => {
    const { factory, renderer, doc } = setupRenderer();
    const host = doc.querySelector('app-root');

    const a = renderer.createElement('a', null);
    renderer.setAttribute(a, 'href', '/x?a=1&b=2');
    renderer.appendChild(host, a);

    factory.injectIntoDocument('app-root');
    expect(host?.innerHTML).toContain('href="/x?a=1&amp;b=2"');
  });
});

describe('serializeTokenTree (no mutation)', () => {
  it('produces stable output across repeated calls', () => {
    const { factory, renderer } = setupRenderer();
    const root = (factory as any).rootToken;

    const div = renderer.createElement('div', null);
    renderer.addClass(div, 'a');
    renderer.addClass(div, 'b');
    renderer.setStyle(div, 'color', 'red');
    renderer.setAttribute(div, 'id', 'x');
    renderer.appendChild(root, div);

    const first = serializeTokenTree(root);
    const second = serializeTokenTree(root);
    const third = serializeTokenTree(root);

    expect(first).toBe(second);
    expect(second).toBe(third);
    // sanity: classes/styles aren't being concatenated each pass
    const classMatches = first.match(/class="[^"]*"/g) ?? [];
    expect(classMatches).toEqual([`class="a b"`]);
  });
});

describe('void elements', () => {
  it('serializes without closing tags', () => {
    const { factory, renderer, doc } = setupRenderer();
    const host = doc.querySelector('app-root');
    const br = renderer.createElement('br', null);
    renderer.appendChild(host, br);
    factory.injectIntoDocument('app-root');
    expect(host?.innerHTML).toBe('<br>');
  });
});
