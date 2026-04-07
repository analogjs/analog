/**
 * String-based Renderer2 implementation for Angular SSR.
 *
 * Instead of building a live DOM tree, this renderer constructs a lightweight
 * token tree (tag name, attributes, children) that is serialized to an HTML
 * string at the end of the render pass. This avoids the overhead of full DOM
 * emulation libraries like Happy DOM or Domino.
 */

import {
  Renderer2,
  RendererFactory2,
  RendererStyleFlags2,
  RendererType2,
} from '@angular/core';

import { ShimDocument, ShimElement, ShimNode } from './dom-shim';

// ---------------------------------------------------------------------------
// Token types — lightweight stand-ins for DOM nodes
// ---------------------------------------------------------------------------

const enum TokenType {
  Element = 1,
  Text = 3,
  Comment = 8,
}

interface TokenBase {
  type: TokenType;
  parent: ElementToken | null;
  nextSibling: Token | null;
  prevSibling: Token | null;
}

export interface ElementToken extends TokenBase {
  type: TokenType.Element;
  tagName: string;
  namespace: string | null;
  attributes: Map<string, string>;
  classes: Set<string>;
  styles: Map<string, string>;
  children: Token[];
  /** Whether this is a void element (br, img, input, etc.) */
  isVoid: boolean;
}

export interface TextToken extends TokenBase {
  type: TokenType.Text;
  value: string;
}

export interface CommentToken extends TokenBase {
  type: TokenType.Comment;
  value: string;
}

export type Token = ElementToken | TextToken | CommentToken;

// Void elements
const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

// Properties that map to attributes
const PROP_TO_ATTR: Record<string, string> = {
  className: 'class',
  htmlFor: 'for',
  tabIndex: 'tabindex',
  readOnly: 'readonly',
};

// Boolean attributes
const BOOLEAN_ATTRS = new Set([
  'allowfullscreen',
  'async',
  'autofocus',
  'autoplay',
  'checked',
  'controls',
  'default',
  'defer',
  'disabled',
  'formnovalidate',
  'hidden',
  'inert',
  'ismap',
  'itemscope',
  'loop',
  'multiple',
  'muted',
  'nomodule',
  'novalidate',
  'open',
  'playsinline',
  'readonly',
  'required',
  'reversed',
  'selected',
]);

// ---------------------------------------------------------------------------
// Token creation helpers
// ---------------------------------------------------------------------------

function createElementToken(
  tagName: string,
  namespace: string | null,
): ElementToken {
  return {
    type: TokenType.Element,
    tagName,
    namespace,
    attributes: new Map(),
    classes: new Set(),
    styles: new Map(),
    children: [],
    parent: null,
    nextSibling: null,
    prevSibling: null,
    isVoid: VOID_ELEMENTS.has(tagName.toLowerCase()),
  };
}

function createTextToken(value: string): TextToken {
  return {
    type: TokenType.Text,
    value,
    parent: null,
    nextSibling: null,
    prevSibling: null,
  };
}

function createCommentToken(value: string): CommentToken {
  return {
    type: TokenType.Comment,
    value,
    parent: null,
    nextSibling: null,
    prevSibling: null,
  };
}

// ---------------------------------------------------------------------------
// Tree manipulation helpers
// ---------------------------------------------------------------------------

function detachToken(token: Token): void {
  if (!token.parent) return;
  const siblings = token.parent.children;
  const idx = siblings.indexOf(token);
  if (idx !== -1) {
    siblings.splice(idx, 1);
    // Fix sibling links
    if (token.prevSibling) token.prevSibling.nextSibling = token.nextSibling;
    if (token.nextSibling) token.nextSibling.prevSibling = token.prevSibling;
  }
  token.parent = null;
  token.prevSibling = null;
  token.nextSibling = null;
}

function appendToken(parent: ElementToken, child: Token): void {
  detachToken(child);
  child.parent = parent;
  const last = parent.children[parent.children.length - 1] ?? null;
  if (last) {
    last.nextSibling = child;
    child.prevSibling = last;
  }
  parent.children.push(child);
}

function insertTokenBefore(
  parent: ElementToken,
  newChild: Token,
  refChild: Token,
): void {
  detachToken(newChild);
  const idx = parent.children.indexOf(refChild);
  if (idx === -1) {
    appendToken(parent, newChild);
    return;
  }
  newChild.parent = parent;
  parent.children.splice(idx, 0, newChild);
  // Fix sibling links
  newChild.nextSibling = refChild;
  newChild.prevSibling = refChild.prevSibling;
  if (refChild.prevSibling) refChild.prevSibling.nextSibling = newChild;
  refChild.prevSibling = newChild;
}

function removeToken(parent: ElementToken, child: Token): void {
  detachToken(child);
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function serializeToken(token: Token): string {
  switch (token.type) {
    case TokenType.Text:
      return token.value;
    case TokenType.Comment:
      return `<!--${token.value}-->`;
    case TokenType.Element: {
      const tag = token.tagName.toLowerCase();
      let attrs = '';

      // Merge classes into attribute map
      if (token.classes.size > 0) {
        const existing = token.attributes.get('class');
        const classStr = [...token.classes].join(' ');
        token.attributes.set(
          'class',
          existing ? `${existing} ${classStr}` : classStr,
        );
      }

      // Merge styles into attribute map
      if (token.styles.size > 0) {
        const parts: string[] = [];
        for (const [k, v] of token.styles) {
          parts.push(`${k}: ${v}`);
        }
        const existing = token.attributes.get('style');
        const styleStr = parts.join('; ');
        token.attributes.set(
          'style',
          existing ? `${existing}; ${styleStr}` : styleStr,
        );
      }

      for (const [k, v] of token.attributes) {
        attrs += v === '' ? ` ${k}` : ` ${k}="${escapeHTML(v)}"`;
      }

      if (token.isVoid) {
        return `<${tag}${attrs}>`;
      }

      let childrenHTML = '';
      for (const child of token.children) {
        childrenHTML += serializeToken(child);
      }
      return `<${tag}${attrs}>${childrenHTML}</${tag}>`;
    }
  }
}

export function serializeTokenTree(root: ElementToken): string {
  let html = '';
  for (const child of root.children) {
    html += serializeToken(child);
  }
  return html;
}

// ---------------------------------------------------------------------------
// StringRenderer
// ---------------------------------------------------------------------------

export class StringRenderer implements Renderer2 {
  data: { [key: string]: any } = {};
  destroyNode = null;

  private shimDocument: ShimDocument;
  private rootToken: ElementToken;

  constructor(shimDocument: ShimDocument, rootToken: ElementToken) {
    this.shimDocument = shimDocument;
    this.rootToken = rootToken;
  }

  destroy(): void {}

  createElement(name: string, namespace?: string | null): ElementToken {
    return createElementToken(name, namespace ?? null);
  }

  createComment(value: string): CommentToken {
    return createCommentToken(value);
  }

  createText(value: string): TextToken {
    return createTextToken(value);
  }

  appendChild(parent: any, newChild: Token): void {
    if (!newChild) return;

    // If parent is a ShimElement (e.g., document.body from selectRootElement),
    // use the root token instead
    if (parent instanceof ShimElement || parent instanceof ShimNode) {
      appendToken(this.rootToken, newChild);
      return;
    }

    if (parent && parent.type === TokenType.Element) {
      appendToken(parent as ElementToken, newChild);
    }
  }

  insertBefore(parent: any, newChild: Token, refChild: Token): void {
    if (!newChild) return;
    if (!refChild) {
      this.appendChild(parent, newChild);
      return;
    }

    if (parent instanceof ShimElement || parent instanceof ShimNode) {
      insertTokenBefore(this.rootToken, newChild, refChild);
      return;
    }

    if (parent && parent.type === TokenType.Element) {
      insertTokenBefore(parent as ElementToken, newChild, refChild);
    }
  }

  removeChild(parent: any, oldChild: Token): void {
    if (!oldChild) return;

    if (parent instanceof ShimElement || parent instanceof ShimNode) {
      removeToken(this.rootToken, oldChild);
      return;
    }

    if (parent && parent.type === TokenType.Element) {
      removeToken(parent as ElementToken, oldChild);
    }
  }

  selectRootElement(
    selectorOrNode: string | any,
    preserveContent?: boolean,
  ): any {
    // When Angular bootstraps, it selects the root element.
    // We return the app root from the shim document so Angular can find it,
    // but our renderer will use the root token for actual rendering.
    if (typeof selectorOrNode === 'string') {
      const el = this.shimDocument.querySelector(selectorOrNode);
      return el || this.rootToken;
    }
    return selectorOrNode;
  }

  parentNode(node: any): any {
    if (node && node.parent !== undefined) {
      return node.parent;
    }
    if (node instanceof ShimNode) {
      return node.parentNode;
    }
    return null;
  }

  nextSibling(node: any): any {
    if (node && node.nextSibling !== undefined) {
      return node.nextSibling;
    }
    if (node instanceof ShimNode) {
      return node.nextSibling;
    }
    return null;
  }

  setAttribute(
    el: any,
    name: string,
    value: string,
    namespace?: string | null,
  ): void {
    if (el instanceof ShimElement) {
      el.setAttribute(namespace ? `${namespace}:${name}` : name, value);
      return;
    }
    if (el && el.type === TokenType.Element) {
      const token = el as ElementToken;
      const attrName = namespace ? `${namespace}:${name}` : name;
      token.attributes.set(attrName, value);
    }
  }

  removeAttribute(el: any, name: string, namespace?: string | null): void {
    if (el instanceof ShimElement) {
      el.removeAttribute(namespace ? `${namespace}:${name}` : name);
      return;
    }
    if (el && el.type === TokenType.Element) {
      const token = el as ElementToken;
      const attrName = namespace ? `${namespace}:${name}` : name;
      token.attributes.delete(attrName);
    }
  }

  addClass(el: any, name: string): void {
    if (el instanceof ShimElement) {
      el.classList.add(name);
      return;
    }
    if (el && el.type === TokenType.Element) {
      (el as ElementToken).classes.add(name);
    }
  }

  removeClass(el: any, name: string): void {
    if (el instanceof ShimElement) {
      el.classList.remove(name);
      return;
    }
    if (el && el.type === TokenType.Element) {
      (el as ElementToken).classes.delete(name);
    }
  }

  setStyle(
    el: any,
    style: string,
    value: any,
    flags?: RendererStyleFlags2,
  ): void {
    if (el instanceof ShimElement) {
      const important = flags && flags & RendererStyleFlags2.Important;
      el.style.setProperty(style, value, important ? 'important' : undefined);
      return;
    }
    if (el && el.type === TokenType.Element) {
      const token = el as ElementToken;
      const important = flags && flags & RendererStyleFlags2.Important;
      token.styles.set(
        style,
        important ? `${value} !important` : String(value),
      );
    }
  }

  removeStyle(el: any, style: string): void {
    if (el instanceof ShimElement) {
      el.style.removeProperty(style);
      return;
    }
    if (el && el.type === TokenType.Element) {
      (el as ElementToken).styles.delete(style);
    }
  }

  setProperty(el: any, name: string, value: any): void {
    if (el instanceof ShimElement) {
      // Map known DOM properties to attributes
      const attrName = PROP_TO_ATTR[name] || name;
      if (typeof value === 'boolean') {
        if (value) {
          el.setAttribute(attrName, '');
        } else {
          el.removeAttribute(attrName);
        }
      } else if (name === 'innerHTML') {
        el.innerHTML = value ?? '';
      } else if (name === 'textContent') {
        el.childNodes = [];
        if (value) {
          const text = el.ownerDocument?.createTextNode(String(value));
          if (text) el.appendChild(text);
        }
      } else {
        el.setAttribute(attrName, String(value ?? ''));
      }
      return;
    }
    if (el && el.type === TokenType.Element) {
      const token = el as ElementToken;
      const attrName = PROP_TO_ATTR[name] || name;

      if (name === 'innerHTML') {
        // Clear children and add raw text
        token.children = [];
        if (value) {
          const text = createTextToken(String(value));
          text.parent = token;
          token.children.push(text);
        }
        return;
      }

      if (name === 'textContent') {
        token.children = [];
        if (value) {
          const text = createTextToken(String(value));
          text.parent = token;
          token.children.push(text);
        }
        return;
      }

      if (typeof value === 'boolean') {
        if (value) {
          token.attributes.set(attrName, '');
        } else {
          token.attributes.delete(attrName);
        }
      } else if (value != null) {
        token.attributes.set(attrName, String(value));
      }
    }
  }

  setValue(node: any, value: string): void {
    if (node instanceof ShimNode) {
      (node as any).nodeValue = value;
      return;
    }
    if (node && node.type === TokenType.Text) {
      (node as TextToken).value = value;
    } else if (node && node.type === TokenType.Comment) {
      (node as CommentToken).value = value;
    }
  }

  listen(): () => void {
    // No-op on server — return unlisten function
    return () => {};
  }
}

// ---------------------------------------------------------------------------
// StringRendererFactory2
// ---------------------------------------------------------------------------

export class StringRendererFactory2 implements RendererFactory2 {
  private shimDocument: ShimDocument;
  private rootToken: ElementToken;
  private renderer: StringRenderer;

  constructor(shimDocument: ShimDocument) {
    this.shimDocument = shimDocument;
    this.rootToken = createElementToken('__root__', null);
    this.renderer = new StringRenderer(shimDocument, this.rootToken);
  }

  createRenderer(hostElement: any, type: RendererType2 | null): Renderer2 {
    // Angular may create multiple renderers for different components,
    // but we use a single shared renderer since we're building one tree.
    return this.renderer;
  }

  begin(): void {}
  end(): void {}

  /**
   * Serialize the token tree and inject it into the shim document's
   * app root element as innerHTML. This must be called after Angular's
   * render pass completes but before serializeDocument().
   */
  injectIntoDocument(appRootSelector: string): void {
    const html = serializeTokenTree(this.rootToken);
    const appRoot = this.shimDocument.querySelector(appRootSelector);
    if (appRoot) {
      appRoot.innerHTML = html;
    } else {
      // Fallback: inject into body
      this.shimDocument.body.innerHTML = html;
    }
  }

  /** Get the serialized HTML from the token tree directly. */
  getRenderedHTML(): string {
    return serializeTokenTree(this.rootToken);
  }
}
