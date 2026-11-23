/**
 * Experimental: lowers TSRX components into ordinary decorated Angular component classes, so
 * that the Angular compiler (analysis, strict template type-checking, Ivy codegen, sanitization)
 * processes them unchanged.
 *
 * ```tsrx
 * import { input, signal } from '@angular/core';
 *
 * export function Counter() @{
 *   const step = input(1);
 *   const count = signal(0);
 *   <button onClick={() => count.update((c) => c + step())}>{count()}</button>
 * }
 * ```
 *
 * becomes (roughly)
 *
 * ```ts
 * @Component({selector: 'Counter', template: '<button (click)="$fc.b0($event)">{{ $fc.b1() }}</button>', …})
 * export class Counter {
 *   readonly step = input(1);
 *   protected readonly $fc = (() => {   // marked @internal
 *     const step = this.step;
 *     const count = signal(0);
 *     const ɵb0 = ($event: any) => ((() => count.update((c) => c + step())) as (e: any) => unknown)($event);
 *     const ɵb1 = () => (count());
 *     return {b0: ɵb0, b1: ɵb1};
 *   })();
 * }
 * ```
 *
 * Every dynamic template expression is hoisted into a closure inside the component body. The
 * generated template only calls those closures through `$fc`, passing template-local variables
 * (`@for` items and indexes) as arguments, so arbitrary TypeScript scoping never reaches the
 * Angular template pipeline.
 */

import {
  type AST,
  CssSelector,
  DomElementSchemaRegistry,
  ImplicitReceiver,
  Lexer,
  ParseLocation,
  Parser,
  ParseSourceFile,
  ParseSourceSpan,
  type PropertyRead,
  RecursiveAstVisitor,
  type SafePropertyRead,
  ThisReceiver,
} from '@angular/compiler';

import {
  jsonLiteral,
  joinMapped,
  MappedText,
  mt,
  type Span,
  TsrxSourceMap,
} from './source-map.js';

/** Name of the class field holding the hoisted template bindings. */
export const TSRX_BINDINGS_FIELD = '$fc';

const CORE_MODULE = '@angular/core';

/** Signal-based member APIs which must be declared as class fields to be recognized. */
const MEMBER_APIS = new Set([
  'input',
  'model',
  'output',
  'viewChild',
  'viewChildren',
  'contentChild',
  'contentChildren',
]);

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
  'source',
  'track',
  'wbr',
]);

/**
 * A node of the ESTree AST produced by `@tsrx/core`. Every node carries `type`,
 * `start` and `end`; `@tsrx/core` ships no TypeScript declarations for the rest.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type EstreeNode = any;

/** The `@tsrx/core` parsers the lowering uses. */
export interface TsrxParsers {
  /** Parses a TSRX module (`parseModule`). */
  parseModule(source: string, fileName: string): EstreeNode;
  /** Parses the content of a `<style>` element (`parseStyle`). */
  parseStyle(css: string): EstreeNode;
}

/** Resolves the selector of a component referenced as a template tag. */
export interface TsrxSelectorResolver {
  /**
   * @param name The exported name of the component (the imported name, not a local alias).
   * @param moduleSpecifier The module it is imported from.
   * @param containingFile The file that references it.
   * @returns The component's selector, or `null` if it could not be determined.
   */
  resolveSelector(
    name: string,
    moduleSpecifier: string,
    containingFile: string,
  ): string | null;
}

export interface TsrxDiagnostic {
  message: string;
  start: number;
  end: number;
}

export interface TsrxLoweringResult {
  /** The lowered TypeScript source. */
  code: string;
  /** Errors encountered while lowering, positioned against the original source. */
  diagnostics: TsrxDiagnostic[];
  /** Maps positions in `code` back to the original TSRX. */
  sourceMap: TsrxSourceMap;
}

type ImportedName =
  | { kind: 'value'; module: string; importedName: string }
  | { kind: 'namespace'; module: string };

/** A template-local variable that hoisted closures receive as a parameter. */
interface Local {
  name: string;
  type: string;
}

class TsrxLoweringError extends Error {
  constructor(
    readonly span: Span,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Selector given to TSRX components without an `XMeta` selector: the component
 * name itself, matching how it is written as a tag (`<Counter />`).
 */
export function defaultSelector(name: string): string {
  return name;
}

const domSchema = new DomElementSchemaRegistry();

/**
 * Whether a selector-less component named `name` would collide with a native
 * element. `document.createElement` lowercases names in HTML documents, so a
 * `Button` host element would be a real `<button>`.
 */
function isNativeElementName(name: string): boolean {
  return domSchema.hasElement(name.toLowerCase(), []);
}

function isUpperCaseStart(name: string): boolean {
  const ch = name[0];
  return ch !== undefined && ch !== ch.toLowerCase();
}

/**
 * Lowers every TSRX component (`function Name() @{ … }`) in a `.tsrx` module.
 */
export function lowerTsrx(
  source: string,
  fileName: string,
  parsers: TsrxParsers,
  resolver: TsrxSelectorResolver,
): TsrxLoweringResult {
  const diagnostics: TsrxDiagnostic[] = [];
  let program: EstreeNode;
  try {
    program = parsers.parseModule(source, fileName);
  } catch (e) {
    // Parse errors from @tsrx/core carry offsets.
    const err = e as { message?: string; pos?: number; end?: number };
    const start = err.pos ?? 0;
    const message = err.message ?? String(e);
    const block = message.startsWith("'}' expected")
      ? angularBlockAround(source, start)
      : null;
    diagnostics.push({
      message:
        block === null
          ? message
          : `${message} An @${block} block renders a single node, like @if and @for; wrap multiple nodes or text in a fragment '<>…</>'.`,
      start,
      end: err.end ?? start,
    });
    return {
      code: source,
      diagnostics,
      sourceMap: TsrxSourceMap.fromMappedText(
        fileName,
        source,
        new MappedText().copyRange(source, 0, source.length),
      ),
    };
  }

  const imports = collectImports(program);
  // The fast compiler recognizes the decorator by its literal name, so the
  // lowering always emits `@Component` and needs that name to be Angular's.
  const decoratorName = 'Component';
  const decoratorBinding = componentBinding(program);
  const existingDecorator =
    decoratorBinding?.kind === 'core-value' ? decoratorName : null;
  if (decoratorBinding !== null && decoratorBinding.kind !== 'core-value') {
    diagnostics.push({
      message:
        decoratorBinding.kind === 'core-type'
          ? "TSRX components need `Component` as a value. Change `type Component` to `Component` in the '@angular/core' import."
          : "TSRX components need the name `Component` for Angular's decorator, but this file uses it for something else. Rename it.",
      start: decoratorBinding.node.start,
      end: decoratorBinding.node.end,
    });
  }
  // `export const XMeta = { … }` carries the `@Component` metadata of the
  // component `X` declared in this file.
  const componentNames = new Set<string>();
  for (const stmt of program.body as EstreeNode[]) {
    const fn = componentFunction(stmt);
    if (fn) {
      componentNames.add(fn.id.name as string);
    }
  }
  const metas = extractMetas(program, componentNames, diagnostics);

  // Selectors of the components declared in this file, for local template tags.
  const localComponents = new Map<string, string>();
  for (const stmt of program.body as EstreeNode[]) {
    const fn = componentFunction(stmt);
    if (!fn) {
      continue;
    }
    const name = fn.id.name as string;
    const metaSelector = metas.get(name)?.selector;
    if (metaSelector === undefined && isNativeElementName(name)) {
      diagnostics.push({
        message:
          `\`${name}\` would render as a native <${name.toLowerCase()}> element, because HTML ` +
          `element names are case-insensitive. Rename the component or set a selector in ` +
          `\`${name}${META_SUFFIX}\`.`,
        start: fn.id.start,
        end: fn.id.end,
      });
    }
    localComponents.set(name, metaSelector ?? defaultSelector(name));
  }

  const replacements: { start: number; end: number; text: MappedText }[] = [];
  const helpers = new Set<string>();

  for (const stmt of program.body as EstreeNode[]) {
    const fn = componentFunction(stmt);
    if (fn === null) {
      rejectStrayTemplates(stmt, diagnostics);
      continue;
    }
    try {
      const lowerer = new ComponentLowerer(
        source,
        fileName,
        parsers,
        imports,
        localComponents,
        resolver,
        helpers,
        decoratorName,
      );
      replacements.push({
        start: stmt.start,
        end: stmt.end,
        text: lowerer.lower(stmt, fn, metas.get(fn.id.name) ?? null),
      });
    } catch (e) {
      if (!(e instanceof TsrxLoweringError)) {
        throw e;
      }
      diagnostics.push({
        message: e.message,
        start: e.span.start,
        end: e.span.end,
      });
    }
  }

  // Everything outside the component declarations is copied verbatim.
  const out = new MappedText();
  let cursor = 0;
  for (const r of replacements) {
    out.copyRange(source, cursor, r.start);
    out.append(r.text);
    cursor = r.end;
  }
  out.copyRange(source, cursor, source.length);

  // Appended rather than prepended so line numbers before the first component are preserved.
  // Imports and type aliases are hoisted, so their position does not matter.
  const injected: string[] = [];
  if (existingDecorator === null && decoratorBinding === null) {
    injected.push(decoratorName);
  }
  injected.push('ChangeDetectionStrategy as ɵngChangeDetectionStrategy');
  const trailer = [
    '',
    `import { ${injected.join(', ')} } from '${CORE_MODULE}';`,
  ];
  if (helpers.has('ForItem')) {
    trailer.push(
      'type ɵngForItem<T> = T extends null | undefined ? never : T extends Iterable<infer U> ? U : never;',
    );
  }
  out.append(trailer.join('\n') + '\n');

  return {
    code: out.text,
    diagnostics,
    sourceMap: TsrxSourceMap.fromMappedText(fileName, source, out),
  };
}

/** `@name (params)` in text, as part of a `@defer` or `@boundary` block. */
interface BlockHeader {
  name: string;
  /** Offset of the `@`. */
  start: number;
  /** The text between the parentheses, if there are any. */
  params: Span | null;
  /** Offset just past the header and the whitespace after it. */
  end: number;
}

/** An Angular `@defer` or `@boundary` block, with its connected blocks. */
interface BlockMatch {
  /** Text in the same JSXText node before the block. */
  textBefore: Span | null;
  main: { header: BlockHeader; content: EstreeNode };
  connected: { header: BlockHeader; content: EstreeNode }[];
  /** Index of the last child the block consumed. */
  lastIndex: number;
}

/** Angular blocks TSRX has no syntax for, each with its connected blocks. */
const ANGULAR_BLOCKS: Record<string, string[]> = {
  defer: ['placeholder', 'loading', 'error'],
  boundary: ['error'],
};

const ANGULAR_BLOCK_NAMES = [
  ...new Set(
    Object.entries(ANGULAR_BLOCKS).flatMap(([name, connected]) => [
      name,
      ...connected,
    ]),
  ),
];

/**
 * The name of the Angular block (`@defer`, `@boundary` or a connected block)
 * whose `{ … }` body directly contains `pos`, if any. Used only to explain a
 * parse error, so a miss just means no hint.
 */
function angularBlockAround(source: string, pos: number): string | null {
  // Walk back to the `{` that opens the body `pos` is directly inside.
  let depth = 0;
  let open = pos - 1;
  for (; open >= 0; open--) {
    const ch = source[open];
    if (ch === '}') depth++;
    else if (ch === '{' && depth-- === 0) break;
  }
  if (open < 0) {
    return null;
  }
  // Then back over `@name`, optional `( … )`, and whitespace before the `{`.
  let end = open - 1;
  while (end >= 0 && isWhitespace(source[end])) end--;
  if (source[end] === ')') {
    let parens = 0;
    for (; end >= 0; end--) {
      if (source[end] === ')') parens++;
      else if (source[end] === '(' && --parens === 0) break;
    }
    end--;
    while (end >= 0 && isWhitespace(source[end])) end--;
  }
  let start = end;
  while (start >= 0 && isIdentifierChar(source[start])) start--;
  const name = source.slice(start + 1, end + 1);
  return source[start] === '@' && ANGULAR_BLOCK_NAMES.includes(name)
    ? name
    : null;
}

/** The JSX inside a `{ … }` container following a block header, if that's what `node` is. */
function blockContent(node: EstreeNode | undefined): EstreeNode | null {
  if (node?.type !== 'JSXExpressionContainer') {
    return null;
  }
  const expr = node.expression;
  return expr.type === 'JSXElement' || expr.type === 'JSXFragment'
    ? expr
    : null;
}

function isWhitespace(ch: string | undefined): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

function isIdentifierChar(ch: string): boolean {
  return (
    ch === '_' ||
    ch === '$' ||
    (ch >= 'a' && ch <= 'z') ||
    (ch >= 'A' && ch <= 'Z') ||
    (ch >= '0' && ch <= '9')
  );
}

/** Index of the `)` matching the `(` at `open`, skipping quoted strings, or -1. */
function findClosingParen(src: string, open: number, limit: number): number {
  let depth = 0;
  for (let i = open; i < limit; i++) {
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipString(src, i, limit);
    } else if (ch === '(') {
      depth++;
    } else if (ch === ')' && --depth === 0) {
      return i;
    }
  }
  return -1;
}

/** Index of the closing quote of the string starting at `start`. */
function skipString(src: string, start: number, limit: number): number {
  const quote = src[start];
  for (let i = start + 1; i < limit; i++) {
    if (src[i] === '\\') {
      i++;
    } else if (src[i] === quote) {
      return i;
    }
  }
  return limit;
}

/** Splits `span` of `src` on `separator` outside parentheses and strings. */
function splitTopLevel(src: string, span: Span, separator: string): Span[] {
  const parts: Span[] = [];
  let depth = 0;
  let start = span.start;
  for (let i = span.start; i < span.end; i++) {
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      i = skipString(src, i, span.end);
    } else if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
    } else if (ch === separator && depth === 0) {
      parts.push({ start, end: i });
      start = i + 1;
    }
  }
  parts.push({ start, end: span.end });
  return parts;
}

function trimSpan(src: string, span: Span): Span {
  let { start, end } = span;
  while (start < end && isWhitespace(src[start])) start++;
  while (end > start && isWhitespace(src[end - 1])) end--;
  return { start, end };
}

/** A component's metadata export, `export const XMeta = { … }`. */
interface ComponentMeta {
  /** The object literal. */
  node: EstreeNode;
  /** Its properties, copied into `@Component`. */
  properties: EstreeNode[];
  /** The selector, when set to a string literal. */
  selector?: string;
}

/** Names a statement declares in its scope, including destructured ones. */
function declaredNames(stmt: EstreeNode): string[] {
  if (
    (stmt.type === 'FunctionDeclaration' || stmt.type === 'ClassDeclaration') &&
    stmt.id
  ) {
    return [stmt.id.name];
  }
  if (stmt.type === 'VariableDeclaration') {
    return (stmt.declarations as EstreeNode[]).flatMap((d) =>
      patternNames(d.id),
    );
  }
  return [];
}

/** Names a binding pattern (`a`, `{ a, b: c }`, `[a, ...rest]`, `a = 1`) binds. */
function patternNames(pattern: EstreeNode | null): string[] {
  switch (pattern?.type) {
    case 'Identifier':
      return [pattern.name];
    case 'ObjectPattern':
      return (pattern.properties as EstreeNode[]).flatMap((p) =>
        patternNames(p.type === 'RestElement' ? p.argument : p.value),
      );
    case 'ArrayPattern':
      return (pattern.elements as (EstreeNode | null)[]).flatMap(patternNames);
    case 'RestElement':
      return patternNames(pattern.argument);
    case 'AssignmentPattern':
      return patternNames(pattern.left);
    default:
      return [];
  }
}

/** Collects the component members an Angular expression reads. */
class InstanceReads extends RecursiveAstVisitor {
  readonly names = new Set<string>();

  override visitPropertyRead(ast: PropertyRead, context: unknown): unknown {
    this.record(ast.receiver, ast.name);
    return super.visitPropertyRead(ast, context);
  }

  override visitSafePropertyRead(
    ast: SafePropertyRead,
    context: unknown,
  ): unknown {
    this.record(ast.receiver, ast.name);
    return super.visitSafePropertyRead(ast, context);
  }

  private record(receiver: AST, name: string): void {
    // Reads off the component itself: `foo` or `this.foo`, not `a.foo`.
    if (
      receiver instanceof ImplicitReceiver ||
      receiver instanceof ThisReceiver
    ) {
      this.names.add(name);
    }
  }
}

/**
 * Names the `XMeta.host` binding (`'[class.x]': 'expr'`) and listener
 * (`'(event)': 'expr'`) expressions read off the component, parsed with
 * Angular's expression parser. Static attributes are skipped. Parse errors
 * are left for the Angular compile to report.
 */
function hostReferences(
  meta: ComponentMeta | null,
  fileName: string,
): Set<string> {
  const reads = new InstanceReads();
  const host = meta?.properties.find(
    (p) =>
      (p.key.type === 'Identifier' ? p.key.name : p.key.value) === 'host' &&
      p.value.type === 'ObjectExpression',
  );
  const parser = new Parser(new Lexer());
  for (const prop of (host?.value.properties ?? []) as EstreeNode[]) {
    const key =
      prop.key?.type === 'Identifier' ? prop.key.name : prop.key?.value;
    if (
      typeof key !== 'string' ||
      prop.value?.type !== 'Literal' ||
      typeof prop.value.value !== 'string'
    ) {
      continue;
    }
    const expression = prop.value.value as string;
    const file = new ParseSourceFile(expression, fileName);
    const span = new ParseSourceSpan(
      new ParseLocation(file, 0, 0, 0),
      new ParseLocation(file, expression.length, 0, expression.length),
    );
    if (key.startsWith('[')) {
      parser.parseBinding(expression, span, 0).visit(reads);
    } else if (key.startsWith('(')) {
      parser.parseAction(expression, span, 0).visit(reads);
    }
  }
  return reads.names;
}

/** `@Component` fields that come from the template and may not be set in `XMeta`. */
const DERIVED_META_FIELDS = new Set([
  'template',
  'templateUrl',
  'imports',
  'changeDetection',
  'styles',
]);

/** The suffix that names a component's metadata export: `XMeta` for `X`. */
const META_SUFFIX = 'Meta';

/**
 * Finds and validates the metadata exports of a module: `export const XMeta =
 * { … }` for each component `X` declared in it. Like decorator metadata, each
 * must be a static object literal, optionally with `satisfies`/`as`. Only
 * PascalCase prefixes count, so Analog's `routeMeta` passes through untouched.
 */
function extractMetas(
  program: EstreeNode,
  componentNames: Set<string>,
  diagnostics: TsrxDiagnostic[],
): Map<string, ComponentMeta> {
  const metas = new Map<string, ComponentMeta>();
  for (const stmt of program.body as EstreeNode[]) {
    const decl =
      stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : null;
    if (decl?.type !== 'VariableDeclaration') {
      continue;
    }
    for (const d of decl.declarations as EstreeNode[]) {
      const exportName: string | undefined =
        d.id.type === 'Identifier' ? d.id.name : undefined;
      if (
        exportName === undefined ||
        exportName.length <= META_SUFFIX.length ||
        !exportName.endsWith(META_SUFFIX)
      ) {
        continue;
      }
      const component = exportName.slice(0, -META_SUFFIX.length);
      // Components are PascalCase. camelCase exports such as Analog's
      // `routeMeta` belong to someone else.
      if (!isUpperCaseStart(component)) {
        continue;
      }
      let init = d.init;
      while (
        init &&
        (init.type === 'TSSatisfiesExpression' ||
          init.type === 'TSAsExpression')
      ) {
        init = init.expression;
      }
      const isMetadataShaped = init?.type === 'ObjectExpression';

      if (!componentNames.has(component)) {
        // Only object literals look like metadata; leave other exports alone.
        if (isMetadataShaped) {
          diagnostics.push({
            message:
              `\`${exportName}\` doesn't match a component in this file. ` +
              `Metadata for a component \`X\` is exported as \`XMeta\`, next to \`function X() @{ … }\`.`,
            start: d.id.start,
            end: d.id.end,
          });
        }
        continue;
      }
      if (decl.kind !== 'const' || !isMetadataShaped) {
        diagnostics.push({
          message: `\`${exportName}\` must be a \`const\` initialized with an object literal.`,
          start: d.start,
          end: d.end,
        });
        continue;
      }

      const meta: ComponentMeta = { node: init, properties: [] };
      for (const prop of init.properties as EstreeNode[]) {
        const key =
          prop.type === 'Property' && !prop.computed
            ? prop.key.type === 'Identifier'
              ? prop.key.name
              : prop.key.value
            : null;
        if (typeof key !== 'string') {
          diagnostics.push({
            message: `\`${exportName}\` properties must be plain \`key: value\` entries.`,
            start: prop.start,
            end: prop.end,
          });
          continue;
        }
        if (DERIVED_META_FIELDS.has(key)) {
          diagnostics.push({
            message:
              key === 'styles'
                ? `'styles' cannot be set in \`${exportName}\`; use a <style> element (or styleUrl).`
                : `'${key}' cannot be set in \`${exportName}\`; it comes from the template.`,
            start: prop.start,
            end: prop.end,
          });
          continue;
        }
        if (key === 'selector') {
          if (
            prop.value.type !== 'Literal' ||
            typeof prop.value.value !== 'string'
          ) {
            diagnostics.push({
              message: `\`${exportName}.selector\` must be a string literal.`,
              start: prop.value.start,
              end: prop.value.end,
            });
            continue;
          }
          meta.selector = prop.value.value;
        }
        meta.properties.push(prop);
      }
      metas.set(component, meta);
    }
  }
  return metas;
}

/** Returns the component function declared by a top-level statement, if any. */
function componentFunction(stmt: EstreeNode): EstreeNode | null {
  const decl =
    stmt.type === 'ExportNamedDeclaration' ||
    stmt.type === 'ExportDefaultDeclaration'
      ? stmt.declaration
      : stmt;
  if (
    decl?.type === 'FunctionDeclaration' &&
    decl.id !== null &&
    decl.body?.type === 'JSXCodeBlock'
  ) {
    return decl;
  }
  return null;
}

class ComponentLowerer {
  private readonly bindings: MappedText[] = [];
  private readonly keys: string[] = [];
  private readonly deps = new Set<string>();
  private readonly styles: MappedText[] = [];
  private counter = 0;

  constructor(
    private readonly source: string,
    private readonly fileName: string,
    private readonly parsers: TsrxParsers,
    private readonly imports: Map<string, ImportedName>,
    private readonly localComponents: Map<string, string>,
    private readonly resolver: TsrxSelectorResolver,
    private readonly helpers: Set<string>,
    private readonly decoratorName: string,
  ) {}

  lower(
    stmt: EstreeNode,
    fn: EstreeNode,
    meta: ComponentMeta | null,
  ): MappedText {
    const name = fn.id.name as string;
    if (fn.params.length > 0) {
      throw new TsrxLoweringError(
        fn.params[0],
        'Angular TSRX components take no parameters. Declare inputs with input(), model() or output().',
      );
    }
    if (fn.async || fn.generator) {
      throw new TsrxLoweringError(
        fn,
        'Angular TSRX components cannot be async or generators.',
      );
    }

    const block = fn.body;
    const fields: MappedText[] = [];
    const aliases: MappedText[] = [];
    const statements: MappedText[] = [];
    // Body locals by name, for exposing the ones host bindings reference.
    const locals = new Map<string, EstreeNode>();
    const memberNames = new Set<string>();
    for (const s of block.body as EstreeNode[]) {
      for (const local of declaredNames(s)) {
        locals.set(local, s);
      }
    }
    for (const s of block.body as EstreeNode[]) {
      const member = this.getMemberDeclaration(s, locals);
      if (member !== null) {
        rejectBodyReads(member, locals);
        memberNames.add(member.id.name);
        fields.push(
          mt`  readonly ${this.copy(member.id)} = ${this.copy(member.init)};`.from(
            s,
          ),
        );
        aliases.push(
          mt`    const ${member.id.name} = this.${member.id.name};`.from(s),
        );
      } else {
        statements.push(mt`    ${this.copy(s)}`);
      }
    }

    if (block.render === null || block.render === undefined) {
      throw new TsrxLoweringError(
        block,
        'A TSRX component must render a template.',
      );
    }
    const template = this.lowerChild(block.render, []);

    const metaProps: (string | MappedText)[] = [];
    if (meta?.selector === undefined) {
      metaProps.push(`selector: ${JSON.stringify(defaultSelector(name))}`);
    }
    for (const prop of meta?.properties ?? []) {
      metaProps.push(this.copy(prop));
    }
    metaProps.push(mt`template: ${jsonLiteral(template)}`.from(block.render));
    if (this.deps.size > 0) {
      metaProps.push(`imports: [${[...this.deps].join(', ')}]`);
    }
    if (this.styles.length > 0) {
      metaProps.push(
        mt`styles: [${joinMapped(this.styles.map(jsonLiteral), ', ')}]`,
      );
    }
    metaProps.push('changeDetection: ɵngChangeDetectionStrategy.OnPush');

    const exportPrefix =
      stmt.type === 'ExportNamedDeclaration'
        ? 'export '
        : stmt.type === 'ExportDefaultDeclaration'
          ? 'export default '
          : '';
    // Host binding expressions run against the instance, so body locals they
    // reference are exposed as fields. Signals and functions keep their
    // identity, so the field always reflects the local.
    const exposed = [...hostReferences(meta, this.fileName)].filter(
      (n) => locals.has(n) && !memberNames.has(n),
    );
    // `let` and `var` locals can change after setup, so they are read and
    // written through accessors instead of copied once.
    const isMutable = (n: string) => {
      const decl = locals.get(n)!;
      return decl.type === 'VariableDeclaration' && decl.kind !== 'const';
    };
    const exposedFields = exposed.map((n) =>
      (isMutable(n)
        ? mt`  /** @internal */ protected get ${n}() { return this.${TSRX_BINDINGS_FIELD}.${n}; }\n  /** @internal */ protected set ${n}(ɵvalue) { this.${TSRX_BINDINGS_FIELD}.${n} = ɵvalue; }`
        : mt`  /** @internal */ protected readonly ${n} = this.${TSRX_BINDINGS_FIELD}.${n};`
      ).from(locals.get(n)!),
    );
    const returned = [
      ...this.keys.map((k) => `${k}: ɵ${k}`),
      ...exposed.map((n) =>
        isMutable(n)
          ? `get ${n}() { return ${n}; }, set ${n}(ɵvalue) { ${n} = ɵvalue; }`
          : n,
      ),
    ];
    const setup = [
      ...aliases,
      ...statements,
      ...this.bindings.map((b) => mt`    ${b}`),
      `    return {${returned.join(', ')}};`,
    ];
    return joinMapped(
      [
        mt`@${this.decoratorName}({\n  ${joinMapped(metaProps, ',\n  ')},\n})`.from(
          fn.id,
        ),
        mt`${exportPrefix}class ${this.copy(fn.id)} {`,
        ...fields,
        mt`  /** @internal */ protected readonly ${TSRX_BINDINGS_FIELD} = (() => {`.from(
          block,
        ),
        ...setup,
        '  })();',
        ...exposedFields,
        '}',
      ],
      '\n',
    ).from(stmt);
  }

  /**
   * Recognizes `const x = input(...)` (and the other signal member APIs) at the top level of the
   * component body. These become class fields so that the compiler recognizes them exactly as it
   * would in a class.
   */
  private getMemberDeclaration(
    stmt: EstreeNode,
    locals: Map<string, EstreeNode>,
  ): { id: EstreeNode; init: EstreeNode } | null {
    if (
      stmt.type !== 'VariableDeclaration' ||
      stmt.kind !== 'const' ||
      stmt.declarations.length !== 1
    ) {
      return null;
    }
    const decl = stmt.declarations[0];
    if (decl.id.type !== 'Identifier' || decl.init?.type !== 'CallExpression') {
      return null;
    }
    let callee = decl.init.callee;
    if (
      callee.type === 'MemberExpression' &&
      !callee.computed &&
      callee.property.name === 'required'
    ) {
      callee = callee.object;
    }
    let memberApi: string | null = null;
    if (callee.type === 'Identifier') {
      if (!locals.has(callee.name)) {
        const imported = this.imports.get(callee.name);
        if (imported?.kind === 'value' && imported.module === CORE_MODULE) {
          memberApi = imported.importedName;
        }
      }
    } else if (
      callee.type === 'MemberExpression' &&
      !callee.computed &&
      callee.object.type === 'Identifier' &&
      callee.property.type === 'Identifier'
    ) {
      if (!locals.has(callee.object.name)) {
        const imported = this.imports.get(callee.object.name);
        if (imported?.kind === 'namespace' && imported.module === CORE_MODULE) {
          memberApi = callee.property.name;
        }
      }
    }
    if (memberApi === null || !MEMBER_APIS.has(memberApi)) {
      return null;
    }
    // The type annotation (if any) lives on the identifier's range in acorn-typescript.
    return { id: decl.id, init: decl.init };
  }

  // ---------------------------------------------------------------------------------------------
  // Bindings

  /** Hoists `expr` into a closure and returns the template expression that calls it. */
  private bindValue(
    expr: EstreeNode,
    scope: Local[],
  ): { call: MappedText; id: string } {
    rejectTemplates(expr);
    const locals = this.freeLocals(expr, scope);
    const id = this.nextId();
    this.bindings.push(
      mt`const ɵ${id} = (${params(locals)}) => (${this.copy(expr)});`.from(
        expr,
      ),
    );
    return {
      call: this.call(
        expr,
        id,
        locals.map((l) => l.name),
      ),
      id,
    };
  }

  /** Hoists an event handler. The handler expression is re-evaluated on every event. */
  private bindEvent(expr: EstreeNode, scope: Local[]): MappedText {
    rejectTemplates(expr);
    const locals = this.freeLocals(expr, scope);
    const id = this.nextId();
    const all = [{ name: '$event', type: 'any' }, ...locals];
    this.bindings.push(
      mt`const ɵ${id} = (${params(all)}) => ((${this.copy(expr)}) as (e: any) => unknown)($event);`.from(
        expr,
      ),
    );
    return this.call(
      expr,
      id,
      all.map((l) => l.name),
    );
  }

  /** Exposes a writable signal for a two-way binding. */
  private bindTwoWay(expr: EstreeNode, scope: Local[]): MappedText {
    rejectTemplates(expr);
    const locals = this.freeLocals(expr, scope);
    if (locals.length > 0) {
      throw new TsrxLoweringError(
        expr,
        `Two-way bindings can't reference template variables (${locals.map((l) => l.name).join(', ')}).`,
      );
    }
    const id = this.nextId();
    this.bindings.push(mt`const ɵ${id} = ${this.copy(expr)};`.from(expr));
    return mt`${TSRX_BINDINGS_FIELD}.${id}`.from(expr);
  }

  private call(node: Span, id: string, args: string[]): MappedText {
    return mt`${TSRX_BINDINGS_FIELD}.${id}(${args.join(', ')})`.from(node);
  }

  private copy(node: Span): MappedText {
    return new MappedText().copy(this.source, node);
  }

  private nextId(): string {
    const id = `b${this.counter++}`;
    this.keys.push(id);
    return id;
  }

  /** Template-local variables referenced by `expr`, in scope order. */
  private freeLocals(expr: EstreeNode, scope: Local[]): Local[] {
    const names = new Set<string>();
    visitIdentifiers(expr, (n) => names.add(n));
    const seen = new Set<string>();
    const result: Local[] = [];
    for (let i = scope.length - 1; i >= 0; i--) {
      if (names.has(scope[i].name) && !seen.has(scope[i].name)) {
        seen.add(scope[i].name);
        result.unshift(scope[i]);
      }
    }
    return result;
  }

  // ---------------------------------------------------------------------------------------------
  // Template generation

  private lowerChild(node: EstreeNode, scope: Local[]): MappedText {
    switch (node.type) {
      case 'JSXText':
        // `value` has entities decoded (`&lt;` is `<`), so it is plain text.
        return mt`${escapeText(cleanJsxText(node.value))}`.from(node);
      case 'JSXExpressionContainer':
        return node.expression.type === 'JSXEmptyExpression'
          ? new MappedText()
          : this.lowerChild(node.expression, scope);
      case 'JSXElement':
        return this.lowerElement(node, scope);
      case 'JSXFragment':
        return this.lowerChildren(node.children, scope);
      case 'JSXStyleElement':
        this.styles.push(this.lowerStyle(node));
        return new MappedText();
      case 'JSXIfExpression':
        return this.lowerIf(node, scope);
      case 'JSXForExpression':
        return this.lowerFor(node, scope);
      case 'JSXSwitchExpression':
        return this.lowerSwitch(node, scope);
      case 'JSXTryExpression':
        return this.lowerTry(node, scope);
      case 'JSXCodeBlock':
        throw new TsrxLoweringError(
          node,
          'Nested code blocks are not supported by the Angular target. Move setup code into the component body.',
        );
      case 'Literal':
        if (typeof node.value === 'string') {
          return mt`${escapeText(node.value)}`.from(node);
        }
        break;
      case 'TemplateLiteral':
        if (node.expressions.length === 0) {
          return mt`${escapeText(node.quasis[0].value.cooked ?? '')}`.from(
            node,
          );
        }
        break;
      case 'ConditionalExpression':
        if (
          containsTemplate(node.consequent) ||
          containsTemplate(node.alternate)
        ) {
          return this.lowerConditional(node, scope);
        }
        break;
      case 'LogicalExpression':
        if (node.operator === '&&' && containsTemplate(node.right)) {
          return mt`@if (${this.bindValue(node.left, scope).call}) {${this.lowerBranch(node.right, scope)}}`.from(
            node,
          );
        }
        break;
      case 'ArrowFunctionExpression':
      case 'FunctionExpression':
        throw new TsrxLoweringError(
          node,
          'Functions cannot be rendered as template children.',
        );
      case 'CallExpression':
        if (
          node.callee.type === 'MemberExpression' &&
          !node.callee.computed &&
          node.callee.property.name === 'map' &&
          node.arguments.some(containsTemplate)
        ) {
          throw new TsrxLoweringError(
            node,
            'Use @for (const item of items; key item.id) { … } instead of .map() to render lists.',
          );
        }
        break;
    }
    if (isExpression(node)) {
      return mt`{{ ${this.bindValue(node, scope).call} }}`.from(node);
    }
    throw new TsrxLoweringError(
      node,
      `Unsupported template node '${node.type}'.`,
    );
  }

  private lowerChildren(children: EstreeNode[], scope: Local[]): MappedText {
    const out = new MappedText();
    for (let i = 0; i < children.length; i++) {
      const block = this.matchAngularBlock(children, i);
      if (block === null) {
        this.rejectStrayBlock(children, i);
        out.append(this.lowerChild(children[i], scope));
        continue;
      }
      if (block.textBefore !== null) {
        out.append(
          mt`${escapeTemplateSyntax(cleanJsxText(this.source.slice(block.textBefore.start, block.textBefore.end)))}`.from(
            block.textBefore,
          ),
        );
      }
      out.append(
        block.main.header.name === 'defer'
          ? this.lowerDefer(block, scope)
          : this.lowerBoundary(block, scope),
      );
      i = block.lastIndex;
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------
  // @defer and @boundary
  //
  // TSRX has no `@defer` or `@boundary` block, and its parser reads Angular's
  // block syntax as text plus expression containers: `@defer (on viewport) {
  // <A /> } @placeholder { <p /> }` arrives as JSXText `@defer (on viewport) `,
  // a container holding `<A />`, JSXText ` @placeholder `, and a container
  // holding `<p />`. That sequence is lowered to Angular's real block.

  /** Recognizes a `@defer` or `@boundary` block starting in `children[index]`, if any. */
  private matchAngularBlock(
    children: EstreeNode[],
    index: number,
  ): BlockMatch | null {
    const text = children[index];
    if (text.type !== 'JSXText') {
      return null;
    }
    const at = this.source.lastIndexOf('@', text.end - 1);
    if (at < text.start) {
      return null;
    }
    const header = this.readBlockHeader(
      at,
      text.end,
      Object.keys(ANGULAR_BLOCKS),
    );
    const content = blockContent(children[index + 1]);
    if (header === null || header.end !== text.end || content === null) {
      return null;
    }

    const match: BlockMatch = {
      textBefore: at > text.start ? { start: text.start, end: at } : null,
      main: { header, content },
      connected: [],
      lastIndex: index + 1,
    };
    // Connected blocks: whitespace, `@placeholder|@loading|@error (…)`, then `{ … }`.
    const connectedNames = ANGULAR_BLOCKS[header.name];
    while (match.lastIndex + 2 < children.length) {
      const next = children[match.lastIndex + 1];
      if (next?.type !== 'JSXText') {
        break;
      }
      let start = next.start;
      while (start < next.end && isWhitespace(this.source[start])) {
        start++;
      }
      const connected = this.readBlockHeader(start, next.end, connectedNames);
      const connectedContent = blockContent(children[match.lastIndex + 2]);
      if (
        connected === null ||
        connected.end !== next.end ||
        connectedContent === null
      ) {
        break;
      }
      match.connected.push({ header: connected, content: connectedContent });
      match.lastIndex += 2;
    }
    return match;
  }

  /**
   * Reads `@name`, optional `( … )` parameters and trailing whitespace from
   * `this.source[start..limit)`. Returns `null` if it isn't one of `names`.
   */
  private readBlockHeader(
    start: number,
    limit: number,
    names: string[],
  ): BlockHeader | null {
    const src = this.source;
    if (src[start] !== '@') {
      return null;
    }
    const name = names.find(
      (n) =>
        src.startsWith(n, start + 1) &&
        !isIdentifierChar(src[start + 1 + n.length] ?? ''),
    );
    if (name === undefined || (start > 0 && isIdentifierChar(src[start - 1]))) {
      return null;
    }
    let pos = start + 1 + name.length;
    while (pos < limit && isWhitespace(src[pos])) pos++;

    let params: Span | null = null;
    if (src[pos] === '(') {
      const close = findClosingParen(src, pos, limit);
      if (close === -1) {
        throw new TsrxLoweringError(
          { start, end: limit },
          `Unclosed parameters for @${name}.`,
        );
      }
      params = { start: pos + 1, end: close };
      pos = close + 1;
      while (pos < limit && isWhitespace(src[pos])) pos++;
    }
    return { name, start, params, end: pos };
  }

  /**
   * Rejects `@name { … }` for an Angular block that wasn't recognized, such as
   * an `@error` with no `@boundary` or `@defer` before it, so it doesn't
   * silently render as text.
   */
  private rejectStrayBlock(children: EstreeNode[], index: number): void {
    const text = children[index];
    const next = children[index + 1];
    if (
      text.type !== 'JSXText' ||
      next?.type !== 'JSXExpressionContainer' ||
      next.expression.type === 'JSXEmptyExpression'
    ) {
      return;
    }
    const at = this.source.lastIndexOf('@', text.end - 1);
    if (at < text.start) {
      return;
    }
    const header = this.readBlockHeader(at, text.end, ANGULAR_BLOCK_NAMES);
    if (header === null || header.end !== text.end) {
      return;
    }
    const span = { start: header.start, end: next.end };
    if (ANGULAR_BLOCKS[header.name] !== undefined) {
      throw new TsrxLoweringError(
        span,
        `An @${header.name} block needs markup, e.g. @${header.name} { <Widget /> }.`,
      );
    }
    const parents = Object.keys(ANGULAR_BLOCKS)
      .filter((name) => ANGULAR_BLOCKS[name].includes(header.name))
      .map((name) => `@${name}`)
      .join(' or ');
    throw new TsrxLoweringError(
      span,
      `@${header.name} must directly follow a ${parents} block.`,
    );
  }

  private lowerDefer(defer: BlockMatch, scope: Local[]): MappedText {
    const { header, content } = defer.main;
    const out = new MappedText();
    out.append('@defer');
    if (header.params !== null) {
      out.append(mt` (${this.lowerDeferTriggers(header.params, scope)})`);
    }
    out.append(mt` {${this.lowerChild(content, scope)}}`);

    for (const block of defer.connected) {
      const params =
        block.header.params === null
          ? ''
          : mt` (${new MappedText().copy(this.source, trimSpan(this.source, block.header.params))})`;
      out.append(
        mt` @${block.header.name}${params} {${this.lowerChild(block.content, scope)}}`.from(
          { start: block.header.start, end: block.content.end },
        ),
      );
    }
    return out.from({ start: header.start, end: content.end });
  }

  /**
   * Angular's `@boundary { … } @error (let err = $error, reset = $reset; when
   * cond) { … }`, written as-is. `let` variables (and `$error` and `$reset`
   * themselves) reach the `@error` block's bindings as parameters, and `when`
   * conditions become bindings that receive the error variable.
   */
  private lowerBoundary(boundary: BlockMatch, scope: Local[]): MappedText {
    const { header, content } = boundary.main;
    if (header.params !== null) {
      throw new TsrxLoweringError(
        { start: header.start, end: header.end },
        '@boundary takes no parameters. Conditions go on @error, e.g. @error (let err; when isNotFound(err)).',
      );
    }
    const out = mt`@boundary {${this.lowerChild(content, scope)}}`;
    for (const block of boundary.connected) {
      const vars: Local[] = [
        { name: '$error', type: 'unknown' },
        { name: '$reset', type: '() => void' },
      ];
      const parts =
        block.header.params === null
          ? []
          : splitTopLevel(this.source, block.header.params, ';')
              .map((part) => trimSpan(this.source, part))
              .filter((part) => part.end > part.start);
      for (const part of parts) {
        if (!this.source.startsWith('when ', part.start)) {
          vars.push(...this.boundaryLets(part));
        }
      }
      const inner = [...scope, ...vars];
      const errorVars = vars.filter((v) => v.type === 'unknown');
      const params = joinMapped(
        parts.map((part) => {
          if (!this.source.startsWith('when ', part.start)) {
            return new MappedText().copy(this.source, part);
          }
          const expr = this.parseExpressionAt({
            start: part.start + 'when '.length,
            end: part.end,
          });
          return mt`when ${this.bindValue(expr, [...scope, ...errorVars]).call}`.from(
            part,
          );
        }),
        '; ',
      );
      out.append(
        mt` @error${parts.length > 0 ? mt` (${params})` : ''} {${this.lowerChild(block.content, inner)}}`.from(
          { start: block.header.start, end: block.content.end },
        ),
      );
    }
    return out.from({ start: header.start, end: content.end });
  }

  /**
   * The variables of an `@error` block's `let err = $error, reset = $reset`
   * parameter (`let err` alone is `$error`; `let` may be left out).
   */
  private boundaryLets(part: Span): Local[] {
    const text = this.source.slice(part.start, part.end);
    const body = text.startsWith('let ') ? text.slice(4) : text;
    const locals: Local[] = [];
    for (const declaration of body.split(',')) {
      const [name, value = '$error'] = declaration
        .split('=')
        .map((s) => s.trim());
      const valid =
        name !== '' &&
        [...name].every(isIdentifierChar) &&
        !(name[0] >= '0' && name[0] <= '9') &&
        (value === '$error' || value === '$reset');
      if (!valid) {
        throw new TsrxLoweringError(
          part,
          `Unsupported @error parameter '${text}'. Expected 'let err = $error, reset = $reset' or 'when condition'.`,
        );
      }
      locals.push({
        name,
        type: value === '$error' ? 'unknown' : '() => void',
      });
    }
    return locals;
  }

  /**
   * Passes `@defer` triggers through to Angular, except the expressions of
   * `when`, `prefetch when` and `hydrate when`, which read component state and
   * so become hoisted bindings like any other template expression.
   */
  private lowerDeferTriggers(params: Span, scope: Local[]): MappedText {
    const parts = splitTopLevel(this.source, params, ';').map((part) =>
      trimSpan(this.source, part),
    );
    return joinMapped(
      parts.map((part) => {
        const text = this.source.slice(part.start, part.end);
        const keyword = ['when ', 'prefetch when ', 'hydrate when '].find((k) =>
          text.startsWith(k),
        );
        if (keyword === undefined) {
          return new MappedText().copy(this.source, part);
        }
        const expr = this.parseExpressionAt({
          start: part.start + keyword.length,
          end: part.end,
        });
        return mt`${keyword}${this.bindValue(expr, scope).call}`.from(part);
      }),
      '; ',
    );
  }

  /**
   * Parses the expression at `span` of the source. Everything outside the span
   * is blanked, so the resulting AST's offsets are positions in the source.
   */
  private parseExpressionAt(span: Span): EstreeNode {
    let padded = '';
    for (let i = 0; i < this.source.length; i++) {
      const ch = this.source[i];
      padded += (i >= span.start && i < span.end) || ch === '\n' ? ch : ' ';
    }
    let program: EstreeNode;
    try {
      program = this.parsers.parseModule(padded, this.fileName);
    } catch {
      throw new TsrxLoweringError(span, 'Expected an expression.');
    }
    const [statement] = program.body as EstreeNode[];
    if (program.body.length !== 1 || statement.type !== 'ExpressionStatement') {
      throw new TsrxLoweringError(span, 'Expected an expression.');
    }
    return statement.expression;
  }

  /** Lowers the body of a `@if`/`@for`/`@switch` block or a conditional branch. */
  private lowerBranch(node: EstreeNode | null, scope: Local[]): MappedText {
    if (node === null || node === undefined || isNullish(node)) {
      return new MappedText();
    }
    if (node.type === 'BlockStatement') {
      const nodes = node.body as EstreeNode[];
      for (const child of nodes) {
        if (!isTemplateNode(child)) {
          throw new TsrxLoweringError(
            child,
            'Statements inside template blocks are not supported by the Angular target. Move setup code into the component body.',
          );
        }
      }
      return this.lowerChildren(nodes, scope).from(node);
    }
    return this.lowerChild(node, scope);
  }

  private lowerConditional(node: EstreeNode, scope: Local[]): MappedText {
    const out = mt`@if (${this.bindValue(node.test, scope).call}) {${this.lowerBranch(node.consequent, scope)}}`;
    let rest = node.alternate;
    while (rest.type === 'ConditionalExpression') {
      out.append(
        mt` @else if (${this.bindValue(rest.test, scope).call}) {${this.lowerBranch(rest.consequent, scope)}}`,
      );
      rest = rest.alternate;
    }
    if (!isNullish(rest)) {
      out.append(mt` @else {${this.lowerBranch(rest, scope)}}`);
    }
    return out.from(node);
  }

  private lowerIf(node: EstreeNode, scope: Local[]): MappedText {
    const out = mt`@if (${this.bindValue(node.test, scope).call}) {${this.lowerBranch(node.consequent, scope)}}`;
    let rest = node.alternate;
    while (rest !== null && rest !== undefined && rest.type === 'IfStatement') {
      out.append(
        mt` @else if (${this.bindValue(rest.test, scope).call}) {${this.lowerBranch(rest.consequent, scope)}}`,
      );
      rest = rest.alternate;
    }
    if (rest !== null && rest !== undefined) {
      out.append(mt` @else {${this.lowerBranch(rest, scope)}}`);
    }
    return out.from(node);
  }

  private lowerFor(node: EstreeNode, scope: Local[]): MappedText {
    if (node.await) {
      throw new TsrxLoweringError(
        node,
        '@for await is not supported by the Angular target.',
      );
    }
    const left = node.left;
    const pattern =
      left.type === 'VariableDeclaration' ? left.declarations[0]?.id : left;
    if (pattern?.type !== 'Identifier') {
      throw new TsrxLoweringError(
        left,
        'The Angular target needs a plain loop variable, e.g. @for (const item of items).',
      );
    }

    const each = this.bindValue(node.right, scope);
    this.helpers.add('ForItem');
    const item: Local = {
      name: pattern.name,
      type: `ɵngForItem<ReturnType<typeof ɵ${each.id}>>`,
    };
    const inner: Local[] = [...scope, item];
    const lets: string[] = [];
    if (node.index) {
      inner.push({ name: node.index.name, type: 'number' });
      lets.push(`let ${node.index.name} = $index`);
    }

    // Angular requires `track`. Without a TSRX `key`, track by position like an unkeyed list.
    const track = node.key ? this.bindValue(node.key, inner).call : '$index';
    const body = this.lowerBranch(node.body, inner);
    const out = mt`@for (${item.name} of ${each.call}; track ${track}${lets.length > 0 ? '; ' + lets.join(', ') : ''}) {${body}}`;
    if (node.empty) {
      out.append(mt` @empty {${this.lowerBranch(node.empty, scope)}}`);
    }
    return out.from(node);
  }

  /**
   * `@try { … } @catch (err, reset) { … }` → Angular's error boundary,
   * `@boundary { … } @error (let err = $error, reset = $reset) { … }`.
   */
  private lowerTry(node: EstreeNode, scope: Local[]): MappedText {
    if (node.pending) {
      throw new TsrxLoweringError(
        node.pendingKeyword ?? node.pending,
        '@pending is not supported by the Angular target: @boundary catches errors but has no pending state.',
      );
    }
    if (node.finalizer) {
      throw new TsrxLoweringError(
        node.finalizer,
        '@finally is not supported by the Angular target.',
      );
    }
    const handler = node.handler;
    if (!handler) {
      throw new TsrxLoweringError(
        node,
        'The Angular target needs a @catch block after @try to render when an error is caught.',
      );
    }

    // `err` and `reset` become template variables of the @error block.
    const lets: string[] = [];
    const inner: Local[] = [...scope];
    for (const [param, source, type] of [
      [handler.param, '$error', 'unknown'],
      [handler.resetParam, '$reset', '() => void'],
    ] as const) {
      if (!param) {
        continue;
      }
      if (param.type !== 'Identifier') {
        throw new TsrxLoweringError(
          param,
          'The Angular target needs plain @catch parameters, e.g. @catch (err, reset).',
        );
      }
      lets.push(`${param.name} = ${source}`);
      inner.push({ name: param.name, type });
    }

    const block = this.lowerBranch(node.block, scope);
    const fallback = this.lowerBranch(handler.body, inner);
    const params = lets.length > 0 ? ` (let ${lets.join(', ')})` : '';
    return mt`@boundary {${block}} @error${params} {${fallback}}`.from(node);
  }

  private lowerSwitch(node: EstreeNode, scope: Local[]): MappedText {
    const value = this.bindValue(node.discriminant, scope);
    const cases: MappedText[] = [];
    for (const c of node.cases as EstreeNode[]) {
      const consequent = (c.consequent as EstreeNode[]).filter(
        (n) => n.type !== 'BreakStatement',
      );
      const body =
        consequent.length === 1 && consequent[0].type === 'BlockStatement'
          ? this.lowerBranch(consequent[0], scope)
          : this.lowerBranch(
              {
                type: 'BlockStatement',
                body: consequent,
                start: c.start,
                end: c.end,
              },
              scope,
            );
      if (c.test === null) {
        cases.push(mt`@default {${body}}`.from(c));
      } else {
        const test =
          c.test.type === 'Literal' && typeof c.test.value === 'string'
            ? mt`${singleQuoted(c.test.value)}`.from(c.test)
            : this.bindValue(c.test, scope).call;
        cases.push(mt`@case (${test}) {${body}}`.from(c));
      }
    }
    return mt`@switch (${value.call}) {${joinMapped(cases, ' ')}}`.from(node);
  }

  // ---------------------------------------------------------------------------------------------
  // Elements and attributes

  private lowerElement(node: EstreeNode, scope: Local[]): MappedText {
    const opening = node.openingElement;
    const nameNode = opening.name;
    let tagName: string;
    let extraAttrs: string[] = [];

    if (nameNode.type === 'JSXIdentifier' && isUpperCaseStart(nameNode.name)) {
      ({ tagName, extraAttrs } = this.resolveComponentTag(nameNode));
      this.deps.add(nameNode.name);
    } else if (nameNode.type === 'JSXIdentifier') {
      tagName = nameNode.name;
    } else if (nameNode.type === 'JSXNamespacedName') {
      tagName = `${nameNode.namespace.name}:${nameNode.name.name}`;
    } else {
      throw new TsrxLoweringError(
        nameNode,
        'Only plain identifiers are supported as component tags.',
      );
    }

    const isComponent =
      nameNode.type === 'JSXIdentifier' && isUpperCaseStart(nameNode.name);
    const attrs: (string | MappedText)[] = [...extraAttrs];
    for (const attr of opening.attributes as EstreeNode[]) {
      const lowered = this.lowerAttribute(attr, scope, isComponent);
      if (lowered !== null) {
        attrs.push(lowered.from(attr));
      }
    }

    const open =
      mt`<${tagName}${attrs.length > 0 ? ' ' : ''}${joinMapped(attrs, ' ')}>`.from(
        opening,
      );
    const children = node.children as EstreeNode[];
    if (VOID_ELEMENTS.has(tagName)) {
      if (children.some((c) => !isWhitespaceText(c))) {
        throw new TsrxLoweringError(node, `<${tagName}> cannot have children.`);
      }
      return open.from(node);
    }
    return mt`${open}${this.lowerChildren(children, scope)}</${tagName}>`.from(
      node,
    );
  }

  private resolveComponentTag(tag: EstreeNode): {
    tagName: string;
    extraAttrs: string[];
  } {
    const name = tag.name as string;
    let selector: string | null;
    if (this.localComponents.has(name)) {
      selector = this.localComponents.get(name)!;
    } else {
      const imported = this.imports.get(name);
      selector =
        imported?.kind !== 'value'
          ? null
          : this.resolver.resolveSelector(
              imported.importedName,
              imported.module,
              this.fileName,
            );
    }
    if (selector === null) {
      throw new TsrxLoweringError(
        tag,
        `Could not determine the selector of '${name}'. It must be a TSRX component or an Angular ` +
          `@Component imported directly from the file that declares it.`,
      );
    }
    const parsed = parseSelector(selector);
    if (parsed === null) {
      throw new TsrxLoweringError(
        tag,
        `Unsupported selector '${selector}' for '${name}'.`,
      );
    }
    return parsed;
  }

  private lowerAttribute(
    attr: EstreeNode,
    scope: Local[],
    isComponent: boolean,
  ): MappedText | null {
    if (attr.type !== 'JSXAttribute') {
      throw new TsrxLoweringError(
        attr,
        'Spread attributes are not supported by the Angular target.',
      );
    }
    let namespace: string | null = null;
    let name: string;
    if (attr.name.type === 'JSXNamespacedName') {
      namespace = attr.name.namespace.name;
      name = attr.name.name.name;
    } else {
      name = attr.name.name;
    }

    const value = attr.value;
    if (value === null || value === undefined) {
      if (namespace !== null) {
        throw new TsrxLoweringError(
          attr,
          `'${namespace}:${name}' requires a value.`,
        );
      }
      return mt`${name}`;
    }

    if (namespace === null && name === 'ref') {
      if (value.type !== 'Literal' || typeof value.value !== 'string') {
        throw new TsrxLoweringError(
          attr,
          '`ref` must be a string literal (e.g. ref="input"). Query it with viewChild().',
        );
      }
      return mt`#${value.value}`;
    }

    if (namespace === null && name === 'use') {
      const list =
        value.type === 'JSXExpressionContainer' ? value.expression : null;
      if (
        list === null ||
        list.type !== 'ArrayExpression' ||
        !list.elements.every((e: EstreeNode | null) => e?.type === 'Identifier')
      ) {
        throw new TsrxLoweringError(
          attr,
          '`use` must be an array of directive classes, e.g. use={[Tooltip]}.',
        );
      }
      for (const el of list.elements) {
        this.deps.add(el.name);
      }
      return null;
    }

    if (value.type === 'Literal' && typeof value.value === 'string') {
      if (namespace !== null && namespace !== 'attr') {
        throw new TsrxLoweringError(
          attr,
          `'${namespace}:${name}' requires an expression value.`,
        );
      }
      const attrName = namespace === 'attr' ? `attr.${name}` : name;
      // Keep `{{`/`@` in static values from being interpreted by the template parser.
      if (
        ['{', '}', '@'].some((ch) => value.value.includes(ch)) ||
        namespace === 'attr'
      ) {
        return mt`[${attrName}]="${escapeAttr(singleQuoted(value.value))}"`;
      }
      return mt`${name}="${escapeAttr(value.value)}"`;
    }

    if (
      value.type !== 'JSXExpressionContainer' ||
      value.expression.type === 'JSXEmptyExpression'
    ) {
      throw new TsrxLoweringError(attr, 'Unsupported attribute value.');
    }
    const expr = value.expression;

    // TSRX events are props named `onX`. DOM events are lowercase (`onKeyDown` → `keydown`);
    // component outputs keep their casing (`onValueChange` → `valueChange`).
    if (
      namespace === null &&
      name.length > 2 &&
      name.startsWith('on') &&
      isUpperCaseStart(name.slice(2))
    ) {
      const event = isComponent
        ? name[2].toLowerCase() + name.slice(3)
        : name.slice(2).toLowerCase();
      return mt`(${event})="${this.bindEvent(expr, scope)}"`;
    }

    // Binding calls (`$fc.bN(a, b)`) never contain characters that need attribute escaping.
    switch (namespace) {
      case null:
        return mt`[${name}]="${this.bindValue(expr, scope).call}"`;
      case 'on':
        return mt`(${name})="${this.bindEvent(expr, scope)}"`;
      case 'bind':
        return mt`[(${name})]="${this.bindTwoWay(expr, scope)}"`;
      case 'attr':
      case 'class':
      case 'style':
        return mt`[${namespace}.${name}]="${this.bindValue(expr, scope).call}"`;
      default:
        throw new TsrxLoweringError(
          attr.name,
          `Unknown attribute namespace '${namespace}:'. Expected on:, bind:, attr:, class: or style:.`,
        );
    }
  }

  /**
   * Moves a `<style>` element's CSS into the component's `styles`, where Angular's emulated
   * encapsulation scopes it to the component. `:global(x)` becomes `::ng-deep x`.
   */
  private lowerStyle(node: EstreeNode): MappedText {
    const start = node.openingElement.end;
    const end = node.closingElement.start;
    const content = this.source.slice(start, end);

    // Find every `:global` in the stylesheet's AST. Offsets are relative to `content`.
    const globals: EstreeNode[] = [];
    const visit = (n: EstreeNode): void => {
      if (n.type === 'PseudoClassSelector' && n.name === 'global') {
        globals.push(n);
      }
      forEachChild(n, visit);
    };
    visit(this.parsers.parseStyle(content));

    // `:global(x)` → `::ng-deep x`, spliced back to front so offsets stay valid.
    let css = content;
    for (const g of globals.sort((a, b) => b.start - a.start)) {
      if (!g.args) {
        throw new TsrxLoweringError(
          { start: start + g.start, end: start + g.end },
          'The `:global { … }` block form is not supported by the Angular target. Use `:global(selector)`.',
        );
      }
      css =
        css.slice(0, g.start) +
        '::ng-deep ' +
        content.slice(g.args.start, g.args.end) +
        css.slice(g.end);
    }
    return mt`${css}`.from({ start, end });
  }
}

// -----------------------------------------------------------------------------------------------
// Helpers

function collectImports(program: EstreeNode): Map<string, ImportedName> {
  const imports = new Map<string, ImportedName>();
  for (const stmt of program.body as EstreeNode[]) {
    if (stmt.type !== 'ImportDeclaration' || stmt.importKind === 'type') {
      continue;
    }
    for (const spec of stmt.specifiers as EstreeNode[]) {
      if (spec.importKind === 'type') {
        continue;
      }
      if (spec.type === 'ImportSpecifier') {
        const importedName =
          spec.imported.type === 'Identifier'
            ? spec.imported.name
            : String(spec.imported.value);
        imports.set(spec.local.name, {
          kind: 'value',
          module: stmt.source.value,
          importedName,
        });
      } else if (spec.type === 'ImportDefaultSpecifier') {
        imports.set(spec.local.name, {
          kind: 'value',
          module: stmt.source.value,
          importedName: 'default',
        });
      } else if (spec.type === 'ImportNamespaceSpecifier') {
        imports.set(spec.local.name, {
          kind: 'namespace',
          module: stmt.source.value,
        });
      }
    }
  }
  return imports;
}

/**
 * How the module binds the name `Component`: Angular's decorator as a value or
 * type import, something else, or nothing (`null`).
 */
function componentBinding(program: EstreeNode): {
  kind: 'core-value' | 'core-type' | 'other';
  node: EstreeNode;
} | null {
  const name = 'Component';
  for (const stmt of program.body as EstreeNode[]) {
    if (stmt.type === 'ImportDeclaration') {
      for (const spec of stmt.specifiers as EstreeNode[]) {
        if (spec.local.name !== name) {
          continue;
        }
        const imported =
          spec.type === 'ImportSpecifier'
            ? spec.imported.type === 'Identifier'
              ? spec.imported.name
              : String(spec.imported.value)
            : null;
        if (stmt.source.value !== CORE_MODULE || imported !== name) {
          return { kind: 'other', node: spec };
        }
        const isType = stmt.importKind === 'type' || spec.importKind === 'type';
        return { kind: isType ? 'core-type' : 'core-value', node: spec };
      }
      continue;
    }
    const decl =
      stmt.type.startsWith('Export') && stmt.declaration
        ? stmt.declaration
        : stmt;
    if (decl.id?.name === name) {
      return { kind: 'other', node: decl.id };
    }
    if (decl.type === 'VariableDeclaration') {
      for (const d of decl.declarations as EstreeNode[]) {
        if (d.id.type === 'Identifier' && d.id.name === name) {
          return { kind: 'other', node: d.id };
        }
      }
    }
  }
  return null;
}

const TEMPLATE_NODE_TYPES = new Set([
  'JSXElement',
  'JSXFragment',
  'JSXText',
  'JSXExpressionContainer',
  'JSXStyleElement',
  'JSXIfExpression',
  'JSXForExpression',
  'JSXSwitchExpression',
  'JSXTryExpression',
]);

function isTemplateNode(node: EstreeNode): boolean {
  return TEMPLATE_NODE_TYPES.has(node.type);
}

/** Walks `node`'s children (skipping position metadata). */
function forEachChild(
  node: EstreeNode,
  visit: (child: EstreeNode) => void,
): void {
  for (const [key, value] of Object.entries(node)) {
    if (
      key === 'loc' ||
      key === 'metadata' ||
      key === 'parent' ||
      key === 'css'
    ) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const v of value) {
        if (v && typeof v === 'object' && typeof v.type === 'string') {
          visit(v);
        }
      }
    } else if (
      value &&
      typeof value === 'object' &&
      typeof (value as EstreeNode).type === 'string'
    ) {
      visit(value as EstreeNode);
    }
  }
}

function containsTemplate(node: EstreeNode | null | undefined): boolean {
  if (!node) {
    return false;
  }
  if (
    isTemplateNode(node) &&
    node.type !== 'JSXText' &&
    node.type !== 'JSXExpressionContainer'
  ) {
    return true;
  }
  let found = false;
  forEachChild(node, (c) => {
    found ||= containsTemplate(c);
  });
  return found;
}

function rejectTemplates(expr: EstreeNode): void {
  if (containsTemplate(expr)) {
    throw new TsrxLoweringError(
      expr,
      'Templates are only allowed as rendered output, not inside expressions.',
    );
  }
}

/** Reports templates outside of components, which the Angular target can't render. */
function rejectStrayTemplates(
  stmt: EstreeNode,
  diagnostics: TsrxDiagnostic[],
): void {
  const visit = (node: EstreeNode): void => {
    if (
      node.type === 'JSXCodeBlock' ||
      (isTemplateNode(node) && node.type !== 'JSXText')
    ) {
      diagnostics.push({
        message:
          'The Angular target only supports templates inside component functions (`function Name() @{ … }`).',
        start: node.start,
        end: node.end,
      });
      return;
    }
    forEachChild(node, visit);
  };
  visit(stmt);
}

/**
 * Collects the free identifier references in an expression: not property names
 * or object keys, and not names that a nested function, block or catch clause
 * declares (`(initial) => initial` doesn't read an outer `initial`).
 */
function visitIdentifiers(
  node: EstreeNode,
  add: (name: string) => void,
  shadowed: ReadonlySet<string> = new Set(),
): void {
  const visit = (child: EstreeNode, names: ReadonlySet<string> = shadowed) =>
    visitIdentifiers(child, add, names);
  const declaring = (names: string[]) =>
    names.length === 0 ? shadowed : new Set([...shadowed, ...names]);
  switch (node.type) {
    case 'Identifier':
      if (!shadowed.has(node.name)) {
        add(node.name);
      }
      return;
    case 'MemberExpression':
      visit(node.object);
      if (node.computed) {
        visit(node.property);
      }
      return;
    case 'Property':
      if (node.shorthand) {
        break;
      }
      if (node.computed) {
        visit(node.key);
      }
      visit(node.value);
      return;
    case 'ArrowFunctionExpression':
    case 'FunctionExpression':
    case 'FunctionDeclaration': {
      const names = (node.params as EstreeNode[]).flatMap(patternNames);
      if (node.type === 'FunctionExpression' && node.id) {
        names.push(node.id.name);
      }
      // Parameter defaults see the parameters, not the body's declarations;
      // the body (a block, or an arrow's expression) sees both.
      const params = declaring(names);
      for (const param of node.params as EstreeNode[]) {
        visit(param, params);
      }
      visit(node.body, params);
      return;
    }
    case 'BlockStatement':
    case 'StaticBlock': {
      const inner = declaring(
        (node.body as EstreeNode[]).flatMap(declaredNames),
      );
      forEachChild(node, (c) => visit(c, inner));
      return;
    }
    case 'CatchClause': {
      const inner = declaring(patternNames(node.param));
      forEachChild(node, (c) => visit(c, inner));
      return;
    }
    case 'ForStatement':
    case 'ForInStatement':
    case 'ForOfStatement': {
      const head = node.type === 'ForStatement' ? node.init : node.left;
      const inner = declaring(
        head?.type === 'VariableDeclaration' ? declaredNames(head) : [],
      );
      forEachChild(node, (c) => visit(c, inner));
      return;
    }
  }
  forEachChild(node, (c) => visit(c));
}

/**
 * Member APIs become class fields, which are initialized before the component
 * body runs, so their initializers can't read names the body declares.
 */
function rejectBodyReads(
  member: { id: EstreeNode; init: EstreeNode },
  locals: Map<string, EstreeNode>,
): void {
  let read: string | undefined;
  visitIdentifiers(member.init, (n) => {
    if (read === undefined && n !== member.id.name && locals.has(n)) {
      read = n;
    }
  });
  if (read !== undefined) {
    throw new TsrxLoweringError(
      member.init,
      `\`${member.id.name}\` becomes a class field, which is initialized before the component body runs, so it can't read \`${read}\`. Move \`${read}\` out of the component, to module scope.`,
    );
  }
}

function isExpression(node: EstreeNode): boolean {
  return (
    !isTemplateNode(node) &&
    !node.type.endsWith('Statement') &&
    !node.type.endsWith('Declaration')
  );
}

function isNullish(node: EstreeNode): boolean {
  return (
    (node.type === 'Literal' &&
      (node.value === null || node.value === false)) ||
    (node.type === 'Identifier' && node.name === 'undefined')
  );
}

function isWhitespaceText(node: EstreeNode): boolean {
  return node.type === 'JSXText' && cleanJsxText(node.value) === '';
}

/**
 * Converts a component selector into the tag and attributes used to instantiate
 * it, using Angular's selector parser. Uses the first selector of a list;
 * attribute- or class-only selectors are placed on a `<div>`.
 */
function parseSelector(
  selector: string,
): { tagName: string; extraAttrs: string[] } | null {
  let parsed: CssSelector | undefined;
  try {
    parsed = CssSelector.parse(selector)[0];
  } catch {
    return null;
  }
  if (
    parsed === undefined ||
    parsed.notSelectors.length > 0 ||
    (parsed.element === null &&
      parsed.attrs.length === 0 &&
      parsed.classNames.length === 0)
  ) {
    return null;
  }
  const extraAttrs: string[] = [];
  for (let i = 0; i < parsed.attrs.length; i += 2) {
    const name = parsed.attrs[i];
    const value = parsed.attrs[i + 1];
    extraAttrs.push(value === '' ? name : `${name}="${escapeAttr(value)}"`);
  }
  if (parsed.classNames.length > 0) {
    extraAttrs.push(`class="${escapeAttr(parsed.classNames.join(' '))}"`);
  }
  return { tagName: parsed.element ?? 'div', extraAttrs };
}

/** Splits text into lines on CRLF, LF or CR. */
function splitLines(text: string): string[] {
  const lines: string[] = [];
  let current = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\r' || ch === '\n') {
      lines.push(current);
      current = '';
      if (ch === '\r' && text[i + 1] === '\n') {
        i++;
      }
    } else {
      current += ch;
    }
  }
  lines.push(current);
  return lines;
}

function trimSpacesStart(line: string): string {
  let i = 0;
  while (line[i] === ' ') i++;
  return line.slice(i);
}

function trimSpacesEnd(line: string): string {
  let i = line.length;
  while (line[i - 1] === ' ') i--;
  return line.slice(0, i);
}

/** Applies JSX whitespace semantics: lines are trimmed and blank lines dropped. */
function cleanJsxText(text: string): string {
  const lines = splitLines(text).map((l) => l.replaceAll('\t', ' '));
  let lastNonEmpty = 0;
  lines.forEach((line, i) => {
    if (line.trim() !== '') {
      lastNonEmpty = i;
    }
  });
  let out = '';
  lines.forEach((raw, i) => {
    let line = raw;
    if (i !== 0) {
      line = trimSpacesStart(line);
    }
    if (i !== lines.length - 1) {
      line = trimSpacesEnd(line);
    }
    if (line !== '') {
      out += i !== lastNonEmpty ? line + ' ' : line;
    }
  });
  return out;
}

/** Escapes plain text (a string, or JSX text with entities decoded) for a template. */
function escapeText(text: string): string {
  return escapeTemplateSyntax(
    text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;'),
  );
}

/**
 * Escapes characters Angular's template parser would treat as syntax in text.
 * For raw JSX source text, whose entities are already HTML.
 */
function escapeTemplateSyntax(text: string): string {
  return text
    .replaceAll('@', '&#64;')
    .replaceAll('{', '&#123;')
    .replaceAll('}', '&#125;');
}

function singleQuoted(value: string): string {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

function escapeAttr(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

function params(locals: Local[]): string {
  return locals.map((l) => `${l.name}: ${l.type}`).join(', ');
}
