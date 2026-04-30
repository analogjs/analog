import { describe, expect, it } from 'vitest';

import {
  ShimDocument,
  ShimElement,
  ShimText,
  createDocument,
  parseHTML,
  serializeDocument,
} from './dom-shim';

describe('createDocument', () => {
  it('parses a full HTML template into head/body', () => {
    const doc = createDocument(
      `<!DOCTYPE html><html lang="en"><head><title>Hi</title></head><body><app-root></app-root></body></html>`,
    );
    expect(doc.documentElement.getAttribute('lang')).toBe('en');
    expect(doc.head.querySelector('title')?.localName).toBe('title');
    expect(doc.body.children[0].localName).toBe('app-root');
  });

  it('round-trips through serializeDocument', () => {
    const doc = createDocument(
      `<!DOCTYPE html><html><head></head><body><app-root></app-root></body></html>`,
    );
    expect(serializeDocument(doc)).toBe(
      `<!DOCTYPE html><html><head></head><body><app-root></app-root></body></html>`,
    );
  });

  it('preserves head children and body attributes', () => {
    const doc = createDocument(
      `<html><head><meta charset="utf-8"><base href="/"></head><body class="dark"><app-root></app-root></body></html>`,
    );
    expect(doc.head.querySelector('meta')?.getAttribute('charset')).toBe(
      'utf-8',
    );
    expect(doc.body.getAttribute('class')).toBe('dark');
  });
});

describe('parseHTML', () => {
  it('parses nested elements with attributes', () => {
    const nodes = parseHTML(
      `<div class="a"><span id="b">hello</span></div>`,
      null,
    );
    expect(nodes).toHaveLength(1);
    const div = nodes[0] as ShimElement;
    expect(div.localName).toBe('div');
    expect(div.getAttribute('class')).toBe('a');
    const span = div.children[0];
    expect(span.localName).toBe('span');
    expect(span.getAttribute('id')).toBe('b');
    expect((span.childNodes[0] as ShimText).nodeValue).toBe('hello');
  });

  it('handles void elements without a closing tag', () => {
    const nodes = parseHTML(`<div><img src="x.png"><br>after</div>`, null);
    const div = nodes[0] as ShimElement;
    expect(div.children.map((c) => c.localName)).toEqual(['img', 'br']);
    expect(div.children[0].getAttribute('src')).toBe('x.png');
    // text after void elements is parsed as text node
    expect(
      div.childNodes
        .filter((n) => n instanceof ShimText)
        .map((t) => (t as ShimText).nodeValue),
    ).toContain('after');
  });

  it('treats <script> content as raw text', () => {
    const nodes = parseHTML(`<script>if (1<2) { x = "<div>"; }</script>`, null);
    const script = nodes[0] as ShimElement;
    expect(script.localName).toBe('script');
    expect(script.children).toHaveLength(0);
    expect((script.childNodes[0] as ShimText).nodeValue).toBe(
      `if (1<2) { x = "<div>"; }`,
    );
  });

  it('parses comments', () => {
    const nodes = parseHTML(`<div><!-- ng -->hi</div>`, null);
    const div = nodes[0] as ShimElement;
    expect(div.childNodes[0].nodeType).toBe(8);
    expect((div.childNodes[1] as ShimText).nodeValue).toBe('hi');
  });
});

describe('serializeDocument', () => {
  it('escapes user-supplied text in element content (no XSS)', () => {
    const doc = new ShimDocument();
    const span = doc.createElement('span');
    span.appendChild(doc.createTextNode('<script>alert(1)</script>'));
    doc.body.appendChild(span);

    const html = serializeDocument(doc);
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  it('does not escape <script> contents', () => {
    const doc = new ShimDocument();
    const script = doc.createElement('script');
    script.appendChild(doc.createTextNode('var x = 1 < 2;'));
    doc.head.appendChild(script);

    const html = serializeDocument(doc);
    expect(html).toContain('<script>var x = 1 < 2;</script>');
  });

  it('escapes attribute values containing quotes and ampersands', () => {
    const doc = new ShimDocument();
    const a = doc.createElement('a');
    a.setAttribute('href', '/x?a=1&b=2');
    a.setAttribute('title', 'say "hi"');
    doc.body.appendChild(a);

    const html = serializeDocument(doc);
    expect(html).toContain('href="/x?a=1&amp;b=2"');
    expect(html).toContain('title="say &quot;hi&quot;"');
  });

  it('emits void elements without a closing tag', () => {
    const doc = new ShimDocument();
    const br = doc.createElement('br');
    doc.body.appendChild(br);
    expect(serializeDocument(doc)).toContain('<br>');
    expect(serializeDocument(doc)).not.toContain('</br>');
  });
});
