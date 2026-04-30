import { describe, expect, it } from 'vitest';

import { createDocument } from './dom-shim';
import { StringRendererFactory2 } from './string-renderer';
import { StringRendererFactory2V2 } from './string-renderer-v2';

const TEMPLATE = `<!DOCTYPE html><html><head></head><body><app-root></app-root></body></html>`;

type Op =
  | { kind: 'createElement'; tag: string; ref: string }
  | { kind: 'createText'; value: string; ref: string }
  | { kind: 'createComment'; value: string; ref: string }
  | { kind: 'setAttribute'; ref: string; name: string; value: string }
  | { kind: 'addClass'; ref: string; name: string }
  | { kind: 'setStyle'; ref: string; name: string; value: string }
  | { kind: 'setProperty'; ref: string; name: string; value: any }
  | { kind: 'append'; parent: string; child: string };

function runOps(factory: any, ops: Op[]): string {
  const renderer = factory.createRenderer(null, null);
  const refs: Record<string, any> = { host: '__host__' };
  // Use the document's app-root as the implicit host for 'host' ops
  const host = factory.shimDocument
    ? factory.shimDocument.querySelector('app-root')
    : null;
  refs.host = host;

  for (const op of ops) {
    switch (op.kind) {
      case 'createElement':
        refs[op.ref] = renderer.createElement(op.tag, null);
        break;
      case 'createText':
        refs[op.ref] = renderer.createText(op.value);
        break;
      case 'createComment':
        refs[op.ref] = renderer.createComment(op.value);
        break;
      case 'setAttribute':
        renderer.setAttribute(refs[op.ref], op.name, op.value);
        break;
      case 'addClass':
        renderer.addClass(refs[op.ref], op.name);
        break;
      case 'setStyle':
        renderer.setStyle(refs[op.ref], op.name, op.value);
        break;
      case 'setProperty':
        renderer.setProperty(refs[op.ref], op.name, op.value);
        break;
      case 'append':
        renderer.appendChild(refs[op.parent], refs[op.child]);
        break;
    }
  }

  factory.injectIntoDocument('app-root');
  return host?.innerHTML ?? '';
}

function parity(ops: Op[]) {
  const v1Doc = createDocument(TEMPLATE);
  const v1 = new StringRendererFactory2(v1Doc);
  // expose internal doc for runOps helper
  (v1 as any).shimDocument = v1Doc;
  const v1Out = runOps(v1, ops);

  const v2Doc = createDocument(TEMPLATE);
  const v2 = new StringRendererFactory2V2(v2Doc);
  (v2 as any).shimDocument = v2Doc;
  const v2Out = runOps(v2, ops);

  return { v1Out, v2Out };
}

describe('StringRenderer V1 vs V2 parity', () => {
  it('basic element + text + comment', () => {
    const { v1Out, v2Out } = parity([
      { kind: 'createElement', tag: 'div', ref: 'd' },
      { kind: 'setAttribute', ref: 'd', name: 'class', value: 'x' },
      { kind: 'append', parent: 'host', child: 'd' },
      { kind: 'createText', value: 'hi', ref: 't' },
      { kind: 'append', parent: 'd', child: 't' },
      { kind: 'createComment', value: 'marker', ref: 'c' },
      { kind: 'append', parent: 'd', child: 'c' },
    ]);
    expect(v2Out).toBe(v1Out);
  });

  it('class merging via setAttribute + addClass', () => {
    const { v1Out, v2Out } = parity([
      { kind: 'createElement', tag: 'div', ref: 'd' },
      { kind: 'setAttribute', ref: 'd', name: 'class', value: 'static' },
      { kind: 'addClass', ref: 'd', name: 'a' },
      { kind: 'addClass', ref: 'd', name: 'b' },
      { kind: 'append', parent: 'host', child: 'd' },
    ]);
    expect(v2Out).toBe(v1Out);
  });

  it('styles + multiple attributes', () => {
    const { v1Out, v2Out } = parity([
      { kind: 'createElement', tag: 'a', ref: 'a' },
      { kind: 'setAttribute', ref: 'a', name: 'href', value: '/x?a=1&b=2' },
      { kind: 'setAttribute', ref: 'a', name: 'title', value: 'hi "you"' },
      { kind: 'setStyle', ref: 'a', name: 'color', value: 'red' },
      { kind: 'setStyle', ref: 'a', name: 'padding', value: '4px' },
      { kind: 'append', parent: 'host', child: 'a' },
    ]);
    expect(v2Out).toBe(v1Out);
  });

  it('text escaping', () => {
    const { v1Out, v2Out } = parity([
      { kind: 'createElement', tag: 'span', ref: 's' },
      { kind: 'append', parent: 'host', child: 's' },
      { kind: 'createText', value: '<script>x</script>', ref: 't' },
      { kind: 'append', parent: 's', child: 't' },
    ]);
    expect(v2Out).toBe(v1Out);
  });

  it('innerHTML pass-through', () => {
    const { v1Out, v2Out } = parity([
      { kind: 'createElement', tag: 'div', ref: 'd' },
      { kind: 'append', parent: 'host', child: 'd' },
      { kind: 'setProperty', ref: 'd', name: 'innerHTML', value: '<b>x</b>' },
    ]);
    expect(v2Out).toBe(v1Out);
  });

  it('void elements', () => {
    const { v1Out, v2Out } = parity([
      { kind: 'createElement', tag: 'br', ref: 'b' },
      { kind: 'append', parent: 'host', child: 'b' },
      { kind: 'createElement', tag: 'img', ref: 'i' },
      { kind: 'setAttribute', ref: 'i', name: 'src', value: 'x.png' },
      { kind: 'append', parent: 'host', child: 'i' },
    ]);
    expect(v2Out).toBe(v1Out);
  });
});
