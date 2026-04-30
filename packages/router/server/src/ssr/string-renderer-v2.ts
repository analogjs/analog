/**
 * String-based Renderer2 — V2 prototype.
 *
 * Same external surface as `string-renderer.ts`, but with a leaner per-element
 * representation aimed at reducing per-request allocation cost:
 *
 *   - attrs: flat `string[]` of alternating [k, v, k, v]; lazy (undefined when empty)
 *   - classNames: space-delimited string; lazy ('' when empty)
 *   - styles: flat `string[]` of alternating [k, v, k, v]; lazy (undefined when empty)
 *   - no prev/next sibling links — `nextSibling` is computed from `children`
 *   - serialization writes to a `string[]` buffer joined once at the end
 *   - HTML escape is single-pass with a no-op fast path
 *
 * V1 keeps a `Map`, a `Set`, another `Map`, and four pointer fields per element.
 * Most components have zero inline styles and ≤3 classes, so the empty
 * containers dominate. V2 only allocates them when used.
 */

import {
  Renderer2,
  RendererFactory2,
  RendererStyleFlags2,
  RendererType2,
} from '@angular/core';

import { ShimDocument, ShimElement, ShimNode, ShimRaw } from './dom-shim';

// ---------------------------------------------------------------------------
// Token types
// ---------------------------------------------------------------------------

const enum TokenType {
  Element = 1,
  Text = 3,
  Comment = 8,
  Raw = 99,
}

interface TokenBase {
  type: TokenType;
  parent: ElementToken | null;
}

export interface ElementToken extends TokenBase {
  type: TokenType.Element;
  /** Lowercased tag, cached at create time so serialize doesn't re-lowercase. */
  tagName: string;
  namespace: string | null;
  /** Flat [k, v, k, v]; undefined when no attributes. */
  attrs?: string[];
  /**
   * Space-delimited class string. Receives both `setAttribute('class', x)`
   * (replaces) and `addClass(x)` (appends). '' when no classes.
   */
  classNames: string;
  /**
   * Pre-serialized style text (e.g. 'color: red; padding: 4px').
   * `setAttribute('style', x)` replaces it; `setStyle/removeStyle` operate
   * on the parsed `styles` array which is rendered after this string.
   * '' when not set via setAttribute.
   */
  styleText: string;
  /** Flat [k, v, k, v]; undefined when no inline styles set via setStyle. */
  styles?: string[];
  children: Token[];
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

export interface RawToken extends TokenBase {
  type: TokenType.Raw;
  value: string;
}

export type Token = ElementToken | TextToken | CommentToken | RawToken;

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

const PROP_TO_ATTR: Record<string, string> = {
  className: 'class',
  htmlFor: 'for',
  tabIndex: 'tabindex',
  readOnly: 'readonly',
};

// ---------------------------------------------------------------------------
// Token factories
// ---------------------------------------------------------------------------

function createElementToken(
  tagName: string,
  namespace: string | null,
): ElementToken {
  const tag = tagName.toLowerCase();
  return {
    type: TokenType.Element,
    tagName: tag,
    namespace,
    classNames: '',
    styleText: '',
    children: [],
    parent: null,
    isVoid: VOID_ELEMENTS.has(tag),
  };
}

function createTextToken(value: string): TextToken {
  return { type: TokenType.Text, value, parent: null };
}

function createCommentToken(value: string): CommentToken {
  return { type: TokenType.Comment, value, parent: null };
}

function createRawToken(value: string): RawToken {
  return { type: TokenType.Raw, value, parent: null };
}

// ---------------------------------------------------------------------------
// Tree manipulation (no sibling links — looked up from `children` on demand)
// ---------------------------------------------------------------------------

function detachToken(token: Token): void {
  const parent = token.parent;
  if (!parent) return;
  const idx = parent.children.indexOf(token);
  if (idx !== -1) parent.children.splice(idx, 1);
  token.parent = null;
}

function appendToken(parent: ElementToken, child: Token): void {
  detachToken(child);
  child.parent = parent;
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
}

function removeTokenChild(parent: ElementToken, child: Token): void {
  if (child.parent === parent) detachToken(child);
}

function nextSiblingOf(token: Token): Token | null {
  const parent = token.parent;
  if (!parent) return null;
  const idx = parent.children.indexOf(token);
  return idx >= 0 && idx < parent.children.length - 1
    ? parent.children[idx + 1]
    : null;
}

// ---------------------------------------------------------------------------
// Attribute / class / style helpers (flat-array storage)
// ---------------------------------------------------------------------------

function findAttrIndex(attrs: string[], name: string): number {
  for (let i = 0; i < attrs.length; i += 2) {
    if (attrs[i] === name) return i;
  }
  return -1;
}

function setAttrFlat(token: ElementToken, name: string, value: string): void {
  const attrs = (token.attrs ??= []);
  const idx = findAttrIndex(attrs, name);
  if (idx === -1) {
    attrs.push(name, value);
  } else {
    attrs[idx + 1] = value;
  }
}

function removeAttrFlat(token: ElementToken, name: string): void {
  const attrs = token.attrs;
  if (!attrs) return;
  const idx = findAttrIndex(attrs, name);
  if (idx !== -1) attrs.splice(idx, 2);
}

function hasClassName(classNames: string, name: string): boolean {
  if (!classNames || !name) return false;
  let idx = 0;
  while (idx <= classNames.length - name.length) {
    const found = classNames.indexOf(name, idx);
    if (found === -1) return false;
    const before = found === 0 || classNames[found - 1] === ' ';
    const afterPos = found + name.length;
    const after =
      afterPos === classNames.length || classNames[afterPos] === ' ';
    if (before && after) return true;
    idx = found + name.length;
  }
  return false;
}

function addClassName(token: ElementToken, name: string): void {
  if (!name || hasClassName(token.classNames, name)) return;
  token.classNames = token.classNames ? `${token.classNames} ${name}` : name;
}

function removeClassName(token: ElementToken, name: string): void {
  if (!token.classNames || !name) return;
  // Cheap path: only one class
  if (token.classNames === name) {
    token.classNames = '';
    return;
  }
  const parts = token.classNames.split(' ');
  let removed = false;
  const out: string[] = [];
  for (const p of parts) {
    if (!removed && p === name) {
      removed = true;
      continue;
    }
    if (p) out.push(p);
  }
  token.classNames = out.join(' ');
}

function setStyleFlat(token: ElementToken, name: string, value: string): void {
  const styles = (token.styles ??= []);
  const idx = findAttrIndex(styles, name);
  if (idx === -1) {
    styles.push(name, value);
  } else {
    styles[idx + 1] = value;
  }
}

function removeStyleFlat(token: ElementToken, name: string): void {
  const styles = token.styles;
  if (!styles) return;
  const idx = findAttrIndex(styles, name);
  if (idx !== -1) styles.splice(idx, 2);
}

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------

const ATTR_ESCAPE_RE = /[&"]/;
const TEXT_ESCAPE_RE = /[&<>]/;

function escapeAttr(str: string): string {
  if (!ATTR_ESCAPE_RE.test(str)) return str;
  return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function escapeText(str: string): string {
  if (!TEXT_ESCAPE_RE.test(str)) return str;
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function serializeElement(token: ElementToken): string {
  const tag = token.tagName;
  let s = '<' + tag;

  // Plain attributes — class/style are routed to dedicated slots at
  // setAttribute time, so this loop never sees them.
  // Empty attributes are emitted as `name=""` (not the bare `name` HTML5
  // shorthand) to match Domino's serialization output.
  if (token.attrs) {
    const a = token.attrs;
    for (let i = 0; i < a.length; i += 2) {
      const v = a[i + 1];
      s += ' ' + a[i] + '="' + (v === '' ? '' : escapeAttr(v)) + '"';
    }
  }

  if (token.classNames) {
    s += ' class="' + escapeAttr(token.classNames) + '"';
  }

  // Build style attribute from styleText (set via setAttribute) and the
  // styles array (set via setStyle). Either or both may be present.
  if (token.styleText || token.styles) {
    let styleStr = token.styleText;
    const styles = token.styles;
    if (styles && styles.length) {
      for (let i = 0; i < styles.length; i += 2) {
        const piece = styles[i] + ': ' + styles[i + 1];
        styleStr = styleStr ? styleStr + '; ' + piece : piece;
      }
    }
    if (styleStr) {
      s += ' style="' + escapeAttr(styleStr) + '"';
    }
  }

  if (token.isVoid) {
    return s + '>';
  }

  s += '>';

  for (const child of token.children) {
    s += serializeNode(child, tag);
  }

  return s + '</' + tag + '>';
}

function serializeNode(token: Token, parentTag?: string): string {
  switch (token.type) {
    case TokenType.Text:
      // Inline raw-text check — `script` and `style` are the only HTML
      // elements whose contents are not HTML-escaped.
      if (parentTag === 'script' || parentTag === 'style') {
        return token.value;
      }
      return escapeText(token.value);
    case TokenType.Raw:
      return token.value;
    case TokenType.Comment:
      return '<!--' + token.value + '-->';
    case TokenType.Element:
      return serializeElement(token);
  }
}

export function serializeToken(token: Token, parentTag?: string): string {
  return serializeNode(token, parentTag);
}

export function serializeTokenTree(root: ElementToken): string {
  let s = '';
  for (const child of root.children) {
    s += serializeNode(child);
  }
  return s;
}

// ---------------------------------------------------------------------------
// StringRendererV2
// ---------------------------------------------------------------------------

export class StringRendererV2 implements Renderer2 {
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
      removeTokenChild(this.rootToken, oldChild);
      return;
    }
    if (parent && parent.type === TokenType.Element) {
      removeTokenChild(parent as ElementToken, oldChild);
    }
  }

  selectRootElement(selectorOrNode: string | any): any {
    if (typeof selectorOrNode === 'string') {
      const el = this.shimDocument.querySelector(selectorOrNode);
      return el || this.rootToken;
    }
    return selectorOrNode;
  }

  parentNode(node: any): any {
    if (node && node.parent !== undefined) return node.parent;
    if (node instanceof ShimNode) return node.parentNode;
    return null;
  }

  nextSibling(node: any): any {
    if (node && node.type !== undefined) return nextSiblingOf(node as Token);
    if (node instanceof ShimNode) return node.nextSibling;
    return null;
  }

  setAttribute(
    el: any,
    name: string,
    value: string,
    namespace?: string | null,
  ): void {
    // HTML attribute names are ASCII case-insensitive; Domino (the default
    // server DOM) lowercases them on write, so to stay byte-for-byte
    // compatible with `render()` we do the same. Namespaced attributes
    // keep their original case.
    const lowered = namespace ? name : name.toLowerCase();
    if (el instanceof ShimElement) {
      el.setAttribute(namespace ? `${namespace}:${lowered}` : lowered, value);
      return;
    }
    if (el && el.type === TokenType.Element) {
      const token = el as ElementToken;
      // Route 'class' and 'style' to dedicated slots so the serializer
      // doesn't have to scan attrs for them on every element. Only the
      // unprefixed names — namespaced attributes (e.g. xml:lang) keep
      // their full key in the flat attrs array.
      if (!namespace) {
        if (lowered === 'class') {
          token.classNames = value;
          return;
        }
        if (lowered === 'style') {
          token.styleText = value;
          return;
        }
      }
      const attrName = namespace ? `${namespace}:${lowered}` : lowered;
      setAttrFlat(token, attrName, value);
    }
  }

  removeAttribute(el: any, name: string, namespace?: string | null): void {
    const lowered = namespace ? name : name.toLowerCase();
    if (el instanceof ShimElement) {
      el.removeAttribute(namespace ? `${namespace}:${lowered}` : lowered);
      return;
    }
    if (el && el.type === TokenType.Element) {
      const token = el as ElementToken;
      if (!namespace) {
        if (lowered === 'class') {
          token.classNames = '';
          return;
        }
        if (lowered === 'style') {
          token.styleText = '';
          return;
        }
      }
      const attrName = namespace ? `${namespace}:${lowered}` : lowered;
      removeAttrFlat(token, attrName);
    }
  }

  addClass(el: any, name: string): void {
    if (el instanceof ShimElement) {
      el.classList.add(name);
      return;
    }
    if (el && el.type === TokenType.Element) {
      addClassName(el as ElementToken, name);
    }
  }

  removeClass(el: any, name: string): void {
    if (el instanceof ShimElement) {
      el.classList.remove(name);
      return;
    }
    if (el && el.type === TokenType.Element) {
      removeClassName(el as ElementToken, name);
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
      const important = flags && flags & RendererStyleFlags2.Important;
      setStyleFlat(
        el as ElementToken,
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
      removeStyleFlat(el as ElementToken, style);
    }
  }

  setProperty(el: any, name: string, value: any): void {
    if (el instanceof ShimElement) {
      const attrName = PROP_TO_ATTR[name] || name;
      if (typeof value === 'boolean') {
        if (value) el.setAttribute(attrName, '');
        else el.removeAttribute(attrName);
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
        token.children = [];
        if (value) {
          const raw = createRawToken(String(value));
          raw.parent = token;
          token.children.push(raw);
        }
        return;
      }

      if (name === 'textContent') {
        token.children = [];
        if (value) {
          const t = createTextToken(String(value));
          t.parent = token;
          token.children.push(t);
        }
        return;
      }

      // Route mapped 'class'/'style' (e.g. className/style props) to the
      // dedicated slots, matching setAttribute semantics.
      if (attrName === 'class') {
        if (value == null || value === false) token.classNames = '';
        else if (value === true) token.classNames = '';
        else token.classNames = String(value);
        return;
      }
      if (attrName === 'style') {
        if (value == null || value === false) token.styleText = '';
        else if (value === true) token.styleText = '';
        else token.styleText = String(value);
        return;
      }

      if (typeof value === 'boolean') {
        if (value) setAttrFlat(token, attrName, '');
        else removeAttrFlat(token, attrName);
      } else if (value != null) {
        setAttrFlat(token, attrName, String(value));
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
    return () => {};
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export class StringRendererFactory2V2 implements RendererFactory2 {
  private shimDocument: ShimDocument;
  private rootToken: ElementToken;
  private renderer: StringRendererV2;

  constructor(shimDocument: ShimDocument) {
    this.shimDocument = shimDocument;
    this.rootToken = createElementToken('__root__', null);
    this.renderer = new StringRendererV2(shimDocument, this.rootToken);
  }

  createRenderer(_hostElement: any, _type: RendererType2 | null): Renderer2 {
    return this.renderer;
  }

  begin(): void {}
  end(): void {}

  injectIntoDocument(appRootSelector: string): void {
    const html = serializeTokenTree(this.rootToken);
    const target =
      this.shimDocument.querySelector(appRootSelector) ??
      this.shimDocument.body;
    for (const child of [...target.childNodes]) {
      target.removeChild(child);
    }
    if (html) {
      const raw = new ShimRaw(html);
      target.appendChild(raw);
    }
  }

  getRenderedHTML(): string {
    return serializeTokenTree(this.rootToken);
  }
}
