/**
 * Minimal DOM shim for Angular SSR.
 *
 * Provides just enough of the DOM API for Angular's internals to work
 * (SharedStylesHost, TransferState, hydration markers) without a full
 * browser emulation library. Zero platform dependencies.
 */

// ---------------------------------------------------------------------------
// Node types
// ---------------------------------------------------------------------------

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;
const DOCUMENT_NODE = 9;

// Void elements that must not have a closing tag
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

// ---------------------------------------------------------------------------
// ShimNode base
// ---------------------------------------------------------------------------

export class ShimNode {
  nodeType: number;
  parentNode: ShimElement | null = null;
  childNodes: ShimNode[] = [];
  ownerDocument: ShimDocument | null = null;
  textContent: string = '';

  constructor(nodeType: number) {
    this.nodeType = nodeType;
  }

  get nextSibling(): ShimNode | null {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.childNodes;
    const idx = siblings.indexOf(this);
    return idx >= 0 && idx < siblings.length - 1 ? siblings[idx + 1] : null;
  }

  get previousSibling(): ShimNode | null {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.childNodes;
    const idx = siblings.indexOf(this);
    return idx > 0 ? siblings[idx - 1] : null;
  }

  get firstChild(): ShimNode | null {
    return this.childNodes[0] || null;
  }

  get lastChild(): ShimNode | null {
    return this.childNodes.length
      ? this.childNodes[this.childNodes.length - 1]
      : null;
  }

  appendChild(child: ShimNode): ShimNode {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    child.parentNode = this as unknown as ShimElement;
    this.childNodes.push(child);
    return child;
  }

  insertBefore(newChild: ShimNode, refChild: ShimNode | null): ShimNode {
    if (!refChild) return this.appendChild(newChild);
    if (newChild.parentNode) {
      newChild.parentNode.removeChild(newChild);
    }
    const idx = this.childNodes.indexOf(refChild);
    if (idx === -1) return this.appendChild(newChild);
    newChild.parentNode = this as unknown as ShimElement;
    this.childNodes.splice(idx, 0, newChild);
    return newChild;
  }

  removeChild(child: ShimNode): ShimNode {
    const idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  replaceChild(newChild: ShimNode, oldChild: ShimNode): ShimNode {
    const idx = this.childNodes.indexOf(oldChild);
    if (idx !== -1) {
      if (newChild.parentNode) {
        newChild.parentNode.removeChild(newChild);
      }
      this.childNodes[idx] = newChild;
      newChild.parentNode = this as unknown as ShimElement;
      oldChild.parentNode = null;
    }
    return oldChild;
  }

  contains(node: ShimNode | null): boolean {
    if (!node) return false;
    let current: ShimNode | null = node;
    while (current) {
      if (current === this) return true;
      current = current.parentNode;
    }
    return false;
  }

  hasChildNodes(): boolean {
    return this.childNodes.length > 0;
  }

  append(...nodes: (ShimNode | string)[]): void {
    for (const node of nodes) {
      if (typeof node === 'string') {
        this.appendChild(new ShimText(node));
      } else {
        this.appendChild(node);
      }
    }
  }

  prepend(...nodes: (ShimNode | string)[]): void {
    const firstChild = this.childNodes[0] || null;
    for (const node of nodes) {
      const child = typeof node === 'string' ? new ShimText(node) : node;
      if (firstChild) {
        this.insertBefore(child, firstChild);
      } else {
        this.appendChild(child);
      }
    }
  }

  after(...nodes: (ShimNode | string)[]): void {
    if (!this.parentNode) return;
    const parent = this.parentNode;
    let refNode = this.nextSibling;
    for (const node of nodes) {
      const child = typeof node === 'string' ? new ShimText(node) : node;
      parent.insertBefore(child, refNode);
    }
  }

  before(...nodes: (ShimNode | string)[]): void {
    if (!this.parentNode) return;
    const parent = this.parentNode;
    for (const node of nodes) {
      const child = typeof node === 'string' ? new ShimText(node) : node;
      parent.insertBefore(child, this);
    }
  }

  remove(): void {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }

  cloneNode(deep?: boolean): ShimNode {
    const clone = new ShimNode(this.nodeType);
    clone.textContent = this.textContent;
    if (deep) {
      for (const child of this.childNodes) {
        clone.appendChild(child.cloneNode(true));
      }
    }
    return clone;
  }
}

// ---------------------------------------------------------------------------
// ShimText
// ---------------------------------------------------------------------------

export class ShimText extends ShimNode {
  nodeValue: string;
  nodeName = '#text';

  constructor(data: string) {
    super(TEXT_NODE);
    this.nodeValue = data;
    this.textContent = data;
  }

  get data(): string {
    return this.nodeValue;
  }

  set data(value: string) {
    this.nodeValue = value;
    this.textContent = value;
  }
}

// ---------------------------------------------------------------------------
// ShimComment
// ---------------------------------------------------------------------------

export class ShimComment extends ShimNode {
  nodeValue: string;
  nodeName = '#comment';

  constructor(data: string) {
    super(COMMENT_NODE);
    this.nodeValue = data;
    this.textContent = data;
  }

  get data(): string {
    return this.nodeValue;
  }

  set data(value: string) {
    this.nodeValue = value;
    this.textContent = value;
  }
}

// ---------------------------------------------------------------------------
// ShimElement
// ---------------------------------------------------------------------------

export class ShimElement extends ShimNode {
  tagName: string;
  localName: string;
  attributes: Map<string, string> = new Map();
  namespaceURI: string | null;
  nodeName: string;

  constructor(
    tagName: string,
    namespace: string | null = null,
    ownerDocument: ShimDocument | null = null,
  ) {
    super(ELEMENT_NODE);
    this.tagName = tagName.toUpperCase();
    this.localName = tagName.toLowerCase();
    this.nodeName = this.tagName;
    this.namespaceURI = namespace;
    this.ownerDocument = ownerDocument;
  }

  // --- children (element-only child nodes) ---

  get children(): ShimElement[] {
    return this.childNodes.filter(
      (n): n is ShimElement => n instanceof ShimElement,
    );
  }

  // --- Attribute accessors ---

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  // --- Class helpers ---

  get className(): string {
    return this.getAttribute('class') ?? '';
  }

  set className(value: string) {
    this.setAttribute('class', value);
  }

  get classList(): {
    add: (name: string) => void;
    remove: (name: string) => void;
    contains: (name: string) => boolean;
    toggle: (name: string) => void;
  } {
    const el = this;
    return {
      add(name: string) {
        const classes = new Set(el.className.split(/\s+/).filter(Boolean));
        classes.add(name);
        el.className = [...classes].join(' ');
      },
      remove(name: string) {
        const classes = new Set(el.className.split(/\s+/).filter(Boolean));
        classes.delete(name);
        el.className = [...classes].join(' ');
      },
      contains(name: string) {
        return el.className.split(/\s+/).includes(name);
      },
      toggle(name: string) {
        if (this.contains(name)) {
          this.remove(name);
        } else {
          this.add(name);
        }
      },
    };
  }

  // --- Style helper ---

  get style(): Record<string, string> & {
    getPropertyValue: (name: string) => string;
    setProperty: (name: string, value: string, priority?: string) => void;
    removeProperty: (name: string) => string;
    cssText: string;
  } {
    const styleMap: Record<string, string> = {};
    const el = this;

    const parseStyle = () => {
      const raw = el.getAttribute('style') ?? '';
      const map: Record<string, string> = {};
      for (const part of raw.split(';')) {
        const colon = part.indexOf(':');
        if (colon > 0) {
          map[part.slice(0, colon).trim()] = part.slice(colon + 1).trim();
        }
      }
      return map;
    };

    const serializeStyle = (map: Record<string, string>) => {
      const parts = Object.entries(map)
        .filter(([, v]) => v !== '')
        .map(([k, v]) => `${k}: ${v}`);
      if (parts.length) {
        el.setAttribute('style', parts.join('; '));
      } else {
        el.removeAttribute('style');
      }
    };

    return Object.assign(styleMap, {
      getPropertyValue(name: string): string {
        return parseStyle()[name] ?? '';
      },
      setProperty(name: string, value: string, priority?: string): void {
        const map = parseStyle();
        map[name] = priority === 'important' ? `${value} !important` : value;
        serializeStyle(map);
      },
      removeProperty(name: string): string {
        const map = parseStyle();
        const old = map[name] ?? '';
        delete map[name];
        serializeStyle(map);
        return old;
      },
      get cssText(): string {
        return el.getAttribute('style') ?? '';
      },
      set cssText(value: string) {
        if (value) {
          el.setAttribute('style', value);
        } else {
          el.removeAttribute('style');
        }
      },
    });
  }

  // --- id shortcut ---

  get id(): string {
    return this.getAttribute('id') ?? '';
  }

  set id(value: string) {
    this.setAttribute('id', value);
  }

  // --- innerHTML ---

  get innerHTML(): string {
    return serializeChildren(this);
  }

  set innerHTML(html: string) {
    this.childNodes = [];
    if (html) {
      const nodes = parseHTML(html, this.ownerDocument);
      for (const node of nodes) {
        this.appendChild(node);
      }
    }
  }

  get outerHTML(): string {
    return serializeNode(this);
  }

  // --- Query helpers ---

  querySelector(selector: string): ShimElement | null {
    return queryOne(this, selector);
  }

  querySelectorAll(selector: string): ShimElement[] {
    const results: ShimElement[] = [];
    queryAll(this, selector, results);
    return results;
  }

  getElementsByTagName(name: string): ShimElement[] {
    const results: ShimElement[] = [];
    const lowerName = name.toLowerCase();
    walkElements(this, (el) => {
      if (lowerName === '*' || el.localName === lowerName) {
        results.push(el);
      }
    });
    return results;
  }

  getElementById(id: string): ShimElement | null {
    let found: ShimElement | null = null;
    walkElements(this, (el) => {
      if (!found && el.getAttribute('id') === id) {
        found = el;
      }
    });
    return found;
  }

  // --- No-op stubs for APIs Angular might touch ---

  addEventListener(): void {}
  removeEventListener(): void {}
  getBoundingClientRect() {
    return { top: 0, left: 0, bottom: 0, right: 0, width: 0, height: 0 };
  }

  // Allow arbitrary property access without throwing
  [key: string]: any;
}

// ---------------------------------------------------------------------------
// ShimDocument
// ---------------------------------------------------------------------------

export class ShimDocument extends ShimNode {
  override nodeType = DOCUMENT_NODE;
  nodeName = '#document';
  documentElement: ShimElement;
  head: ShimElement;
  body: ShimElement;
  defaultView: any = null;
  location: {
    href: string;
    origin: string;
    protocol: string;
    hostname: string;
    port: string;
    pathname: string;
    search: string;
    hash: string;
  } = {
    href: 'http://localhost/',
    origin: 'http://localhost',
    protocol: 'http:',
    hostname: 'localhost',
    port: '',
    pathname: '/',
    search: '',
    hash: '',
  };

  constructor() {
    super(DOCUMENT_NODE);
    this.ownerDocument = null;

    this.documentElement = new ShimElement('html', null, this);
    this.documentElement.ownerDocument = this;

    this.head = new ShimElement('head', null, this);
    this.head.ownerDocument = this;
    this.documentElement.appendChild(this.head);

    this.body = new ShimElement('body', null, this);
    this.body.ownerDocument = this;
    this.documentElement.appendChild(this.body);

    this.childNodes = [this.documentElement];
    this.documentElement.parentNode = this as unknown as ShimElement;
  }

  createElement(tagName: string): ShimElement {
    const el = new ShimElement(tagName, null, this);
    return el;
  }

  createElementNS(namespace: string, tagName: string): ShimElement {
    const el = new ShimElement(tagName, namespace, this);
    return el;
  }

  createTextNode(data: string): ShimText {
    const text = new ShimText(data);
    text.ownerDocument = this;
    return text;
  }

  createComment(data: string): ShimComment {
    const comment = new ShimComment(data);
    comment.ownerDocument = this;
    return comment;
  }

  createDocumentFragment(): ShimElement {
    // Use an element as a lightweight fragment stand-in
    const frag = new ShimElement('#document-fragment', null, this);
    (frag as any).nodeType = 11;
    return frag;
  }

  getElementById(id: string): ShimElement | null {
    return this.documentElement.getElementById(id);
  }

  querySelector(selector: string): ShimElement | null {
    return this.documentElement.querySelector(selector);
  }

  querySelectorAll(selector: string): ShimElement[] {
    return this.documentElement.querySelectorAll(selector);
  }

  getElementsByTagName(name: string): ShimElement[] {
    return this.documentElement.getElementsByTagName(name);
  }

  /**
   * Serialize the document to an HTML string.
   * Compatible with Domino's doc.serialize() which Angular's
   * PlatformState.renderToString() calls.
   */
  serialize(): string {
    return serializeDocument(this);
  }

  // No-op stubs
  createEvent(): any {
    return {};
  }
  addEventListener(): void {}
  removeEventListener(): void {}

  // Allow arbitrary property access
  [key: string]: any;
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

function serializeNode(node: ShimNode): string {
  if (node instanceof ShimText) {
    return node.nodeValue;
  }
  if (node instanceof ShimComment) {
    return `<!--${node.nodeValue}-->`;
  }
  if (node instanceof ShimElement) {
    const tag = node.localName;
    let attrs = '';
    for (const [k, v] of node.attributes) {
      attrs += v === '' ? ` ${k}` : ` ${k}="${escapeHTML(v)}"`;
    }
    if (VOID_ELEMENTS.has(tag)) {
      return `<${tag}${attrs}>`;
    }
    return `<${tag}${attrs}>${serializeChildren(node)}</${tag}>`;
  }
  return serializeChildren(node);
}

function serializeChildren(node: ShimNode): string {
  let html = '';
  for (const child of node.childNodes) {
    html += serializeNode(child);
  }
  return html;
}

export function serializeDocument(doc: ShimDocument): string {
  return `<!DOCTYPE html>${serializeNode(doc.documentElement)}`;
}

// ---------------------------------------------------------------------------
// HTML Parser (lightweight, handles well-formed HTML from Angular)
// ---------------------------------------------------------------------------

export function parseHTML(
  html: string,
  ownerDocument: ShimDocument | null,
): ShimNode[] {
  const nodes: ShimNode[] = [];
  let i = 0;
  const len = html.length;

  while (i < len) {
    if (html[i] === '<') {
      // Comment
      if (html.startsWith('<!--', i)) {
        const endIdx = html.indexOf('-->', i + 4);
        if (endIdx === -1) break;
        const comment = new ShimComment(html.slice(i + 4, endIdx));
        comment.ownerDocument = ownerDocument;
        nodes.push(comment);
        i = endIdx + 3;
        continue;
      }

      // Closing tag
      if (html[i + 1] === '/') {
        const endIdx = html.indexOf('>', i + 2);
        if (endIdx === -1) break;
        // Closing tags are handled by the caller in recursive parse
        // In a flat parse, we just skip them
        i = endIdx + 1;
        continue;
      }

      // Opening tag
      const tagMatch = parseOpeningTag(html, i);
      if (!tagMatch) {
        // Not a valid tag, treat as text
        nodes.push(createText(html[i], ownerDocument));
        i++;
        continue;
      }

      const { tagName, attrs, selfClose, end } = tagMatch;
      const el = new ShimElement(tagName, null, ownerDocument);
      for (const [k, v] of attrs) {
        el.setAttribute(k, v);
      }

      i = end;

      if (!selfClose && !VOID_ELEMENTS.has(tagName.toLowerCase())) {
        // Parse children until we find the matching closing tag
        const closeTag = `</${tagName.toLowerCase()}>`;
        // For script/style, grab raw content
        if (
          tagName.toLowerCase() === 'script' ||
          tagName.toLowerCase() === 'style'
        ) {
          const closeIdx = html.toLowerCase().indexOf(closeTag, i);
          if (closeIdx !== -1) {
            const raw = html.slice(i, closeIdx);
            if (raw) {
              const textNode = new ShimText(raw);
              textNode.ownerDocument = ownerDocument;
              el.appendChild(textNode);
            }
            i = closeIdx + closeTag.length;
          }
        } else {
          // Recursively parse children
          const { children, end: childEnd } = parseChildren(
            html,
            i,
            tagName.toLowerCase(),
            ownerDocument,
          );
          for (const child of children) {
            el.appendChild(child);
          }
          i = childEnd;
        }
      }

      nodes.push(el);
      continue;
    }

    // Text content
    const nextTag = html.indexOf('<', i);
    const textEnd = nextTag === -1 ? len : nextTag;
    const text = html.slice(i, textEnd);
    if (text) {
      nodes.push(createText(text, ownerDocument));
    }
    i = textEnd;
  }

  return nodes;
}

function createText(
  data: string,
  ownerDocument: ShimDocument | null,
): ShimText {
  const t = new ShimText(data);
  t.ownerDocument = ownerDocument;
  return t;
}

interface ParsedTag {
  tagName: string;
  attrs: [string, string][];
  selfClose: boolean;
  end: number;
}

function parseOpeningTag(html: string, start: number): ParsedTag | null {
  let i = start + 1; // skip '<'
  const len = html.length;

  // Read tag name
  let tagName = '';
  while (
    i < len &&
    html[i] !== ' ' &&
    html[i] !== '>' &&
    html[i] !== '/' &&
    html[i] !== '\t' &&
    html[i] !== '\n' &&
    html[i] !== '\r'
  ) {
    tagName += html[i];
    i++;
  }
  if (!tagName) return null;

  // Read attributes
  const attrs: [string, string][] = [];
  while (i < len) {
    // Skip whitespace
    while (i < len && /\s/.test(html[i])) i++;

    if (i >= len) break;
    if (html[i] === '>') {
      i++;
      return { tagName, attrs, selfClose: false, end: i };
    }
    if (html[i] === '/' && html[i + 1] === '>') {
      i += 2;
      return { tagName, attrs, selfClose: true, end: i };
    }

    // Read attribute name
    let attrName = '';
    while (
      i < len &&
      html[i] !== '=' &&
      html[i] !== '>' &&
      html[i] !== '/' &&
      !/\s/.test(html[i])
    ) {
      attrName += html[i];
      i++;
    }

    if (!attrName) {
      i++;
      continue;
    }

    // Check for value
    if (html[i] === '=') {
      i++; // skip '='
      let value = '';
      if (html[i] === '"' || html[i] === "'") {
        const quote = html[i];
        i++; // skip opening quote
        while (i < len && html[i] !== quote) {
          value += html[i];
          i++;
        }
        i++; // skip closing quote
      } else {
        // Unquoted value
        while (i < len && !/[\s>]/.test(html[i])) {
          value += html[i];
          i++;
        }
      }
      attrs.push([attrName, value]);
    } else {
      attrs.push([attrName, '']);
    }
  }

  return { tagName, attrs, selfClose: false, end: i };
}

function parseChildren(
  html: string,
  start: number,
  parentTag: string,
  ownerDocument: ShimDocument | null,
): { children: ShimNode[]; end: number } {
  const children: ShimNode[] = [];
  let i = start;
  const len = html.length;
  const closeTag = `</${parentTag}>`;

  while (i < len) {
    // Check for our closing tag
    if (
      html[i] === '<' &&
      html[i + 1] === '/' &&
      html.slice(i, i + closeTag.length).toLowerCase() === closeTag
    ) {
      return { children, end: i + closeTag.length };
    }

    if (html[i] === '<') {
      // Comment
      if (html.startsWith('<!--', i)) {
        const endIdx = html.indexOf('-->', i + 4);
        if (endIdx === -1) break;
        const comment = new ShimComment(html.slice(i + 4, endIdx));
        comment.ownerDocument = ownerDocument;
        children.push(comment);
        i = endIdx + 3;
        continue;
      }

      // Nested closing tag (shouldn't happen in well-formed HTML from Angular, but handle gracefully)
      if (html[i + 1] === '/') {
        const endIdx = html.indexOf('>', i + 2);
        if (endIdx === -1) break;
        i = endIdx + 1;
        continue;
      }

      // Opening tag
      const tagMatch = parseOpeningTag(html, i);
      if (!tagMatch) {
        children.push(createText(html[i], ownerDocument));
        i++;
        continue;
      }

      const { tagName, attrs, selfClose, end } = tagMatch;
      const el = new ShimElement(tagName, null, ownerDocument);
      for (const [k, v] of attrs) {
        el.setAttribute(k, v);
      }

      i = end;

      if (!selfClose && !VOID_ELEMENTS.has(tagName.toLowerCase())) {
        if (
          tagName.toLowerCase() === 'script' ||
          tagName.toLowerCase() === 'style'
        ) {
          const innerCloseTag = `</${tagName.toLowerCase()}>`;
          const closeIdx = html.toLowerCase().indexOf(innerCloseTag, i);
          if (closeIdx !== -1) {
            const raw = html.slice(i, closeIdx);
            if (raw) {
              const textNode = new ShimText(raw);
              textNode.ownerDocument = ownerDocument;
              el.appendChild(textNode);
            }
            i = closeIdx + innerCloseTag.length;
          }
        } else {
          const result = parseChildren(
            html,
            i,
            tagName.toLowerCase(),
            ownerDocument,
          );
          for (const child of result.children) {
            el.appendChild(child);
          }
          i = result.end;
        }
      }

      children.push(el);
      continue;
    }

    // Text
    const nextTag = html.indexOf('<', i);
    const textEnd = nextTag === -1 ? len : nextTag;
    const text = html.slice(i, textEnd);
    if (text) {
      children.push(createText(text, ownerDocument));
    }
    i = textEnd;
  }

  return { children, end: i };
}

// ---------------------------------------------------------------------------
// Query helpers (minimal selector support: tag, #id, .class, tag#id, tag.class)
// ---------------------------------------------------------------------------

function walkElements(
  root: ShimNode,
  callback: (el: ShimElement) => void,
): void {
  for (const child of root.childNodes) {
    if (child instanceof ShimElement) {
      callback(child);
      walkElements(child, callback);
    }
  }
}

function matchesSelector(el: ShimElement, selector: string): boolean {
  selector = selector.trim();

  // ID selector: #foo
  if (selector.startsWith('#')) {
    return el.getAttribute('id') === selector.slice(1);
  }

  // Class selector: .foo
  if (selector.startsWith('.')) {
    const className = selector.slice(1);
    return el.className.split(/\s+/).includes(className);
  }

  // Tag selector
  if (/^[a-zA-Z][a-zA-Z0-9-]*$/.test(selector)) {
    return el.localName === selector.toLowerCase();
  }

  // tag#id
  const tagIdMatch = selector.match(/^([a-zA-Z][a-zA-Z0-9-]*)#(.+)$/);
  if (tagIdMatch) {
    return (
      el.localName === tagIdMatch[1].toLowerCase() &&
      el.getAttribute('id') === tagIdMatch[2]
    );
  }

  // tag.class
  const tagClassMatch = selector.match(/^([a-zA-Z][a-zA-Z0-9-]*)\.(.+)$/);
  if (tagClassMatch) {
    return (
      el.localName === tagClassMatch[1].toLowerCase() &&
      el.className.split(/\s+/).includes(tagClassMatch[2])
    );
  }

  // Attribute selector: [attr] or [attr="value"]
  const attrMatch = selector.match(/^\[([^\]=]+)(?:="([^"]*)")?\]$/);
  if (attrMatch) {
    const attrName = attrMatch[1];
    const attrValue = attrMatch[2];
    if (attrValue !== undefined) {
      return el.getAttribute(attrName) === attrValue;
    }
    return el.hasAttribute(attrName);
  }

  // tag[attr] or tag[attr="value"]
  const tagAttrMatch = selector.match(
    /^([a-zA-Z][a-zA-Z0-9-]*)\[([^\]=]+)(?:="([^"]*)")?\]$/,
  );
  if (tagAttrMatch) {
    const tag = tagAttrMatch[1].toLowerCase();
    const attrName = tagAttrMatch[2];
    const attrValue = tagAttrMatch[3];
    if (el.localName !== tag) return false;
    if (attrValue !== undefined) {
      return el.getAttribute(attrName) === attrValue;
    }
    return el.hasAttribute(attrName);
  }

  return false;
}

function queryOne(root: ShimNode, selector: string): ShimElement | null {
  let found: ShimElement | null = null;
  walkElements(root, (el) => {
    if (!found && matchesSelector(el, selector)) {
      found = el;
    }
  });
  return found;
}

function queryAll(
  root: ShimNode,
  selector: string,
  results: ShimElement[],
): void {
  walkElements(root, (el) => {
    if (matchesSelector(el, selector)) {
      results.push(el);
    }
  });
}

// ---------------------------------------------------------------------------
// Factory: create a ShimDocument from an HTML string
// ---------------------------------------------------------------------------

export function createDocument(html: string): ShimDocument {
  const doc = new ShimDocument();

  // Strip doctype if present
  let content = html.replace(/<!DOCTYPE[^>]*>/i, '').trim();

  // Strip outer <html> if present and parse into head/body
  const htmlMatch = content.match(/^<html[^>]*>([\s\S]*)<\/html>$/i);
  if (htmlMatch) {
    // Copy html attributes
    const htmlTagMatch = content.match(/^<html([^>]*)>/i);
    if (htmlTagMatch && htmlTagMatch[1]) {
      const attrParsed = parseTagAttributes(htmlTagMatch[1]);
      for (const [k, v] of attrParsed) {
        doc.documentElement.setAttribute(k, v);
      }
    }
    content = htmlMatch[1];
  }

  // Extract <head>...</head>
  const headMatch = content.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (headMatch) {
    const headContent = headMatch[1];
    const headNodes = parseHTML(headContent, doc);
    for (const node of headNodes) {
      doc.head.appendChild(node);
    }
    // Copy head attributes
    const headTagMatch = content.match(/<head([^>]*)>/i);
    if (headTagMatch && headTagMatch[1]) {
      const attrParsed = parseTagAttributes(headTagMatch[1]);
      for (const [k, v] of attrParsed) {
        doc.head.setAttribute(k, v);
      }
    }
  }

  // Extract <body>...</body>
  const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch) {
    const bodyContent = bodyMatch[1];
    const bodyNodes = parseHTML(bodyContent, doc);
    for (const node of bodyNodes) {
      doc.body.appendChild(node);
    }
    // Copy body attributes
    const bodyTagMatch = content.match(/<body([^>]*)>/i);
    if (bodyTagMatch && bodyTagMatch[1]) {
      const attrParsed = parseTagAttributes(bodyTagMatch[1]);
      for (const [k, v] of attrParsed) {
        doc.body.setAttribute(k, v);
      }
    }
  } else if (!headMatch) {
    // No head/body structure — just parse everything into body
    const nodes = parseHTML(content, doc);
    for (const node of nodes) {
      doc.body.appendChild(node);
    }
  }

  return doc;
}

function parseTagAttributes(attrString: string): [string, string][] {
  const attrs: [string, string][] = [];
  const regex = /([a-zA-Z_][\w-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
  let match;
  while ((match = regex.exec(attrString)) !== null) {
    const name = match[1];
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    attrs.push([name, value]);
  }
  return attrs;
}
