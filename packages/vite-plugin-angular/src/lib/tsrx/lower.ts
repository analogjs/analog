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
 * @Component({selector: 'tsrx-counter', template: '<button (click)="$fc.b0($event)">{{ $fc.b1() }}</button>', …})
 * export class Counter {
 *   readonly step = input(1);
 *   protected readonly $fc = (() => {
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

/** Parses a TSRX module, e.g. `parseModule` from `@tsrx/core`. */
export type TsrxParser = (source: string, fileName: string) => EstreeNode;

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

interface ImportedName {
  module: string;
  importedName: string;
}

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

/** Selector given to TSRX components, derived from the function name. */
export function defaultSelector(name: string): string {
  return 'tsrx-' + name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Lowers every TSRX component (`function Name() @{ … }`) in a `.tsrx` module.
 */
export function lowerTsrx(
  source: string,
  fileName: string,
  parse: TsrxParser,
  resolver: TsrxSelectorResolver,
): TsrxLoweringResult {
  const diagnostics: TsrxDiagnostic[] = [];
  let program: EstreeNode;
  try {
    program = parse(source, fileName);
  } catch (e) {
    // Parse errors from @tsrx/core carry offsets.
    const err = e as { message?: string; pos?: number; end?: number };
    const start = err.pos ?? 0;
    diagnostics.push({
      message: err.message ?? String(e),
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
  const existingDecorator = localNameOf(imports, CORE_MODULE, 'Component');
  const decoratorName =
    existingDecorator ??
    (isNameTaken(program, imports, 'Component') ? 'ɵngComponent' : 'Component');
  const localComponents = new Set<string>(
    program.body.flatMap((stmt: EstreeNode) => {
      const fn = componentFunction(stmt);
      return fn ? [fn.id.name as string] : [];
    }),
  );

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
        imports,
        localComponents,
        resolver,
        helpers,
        decoratorName,
      );
      replacements.push({
        start: stmt.start,
        end: stmt.end,
        text: lowerer.lower(stmt, fn),
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
  if (existingDecorator === null) {
    injected.push(
      decoratorName === 'Component'
        ? 'Component'
        : `Component as ${decoratorName}`,
    );
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
    private readonly imports: Map<string, ImportedName>,
    private readonly localComponents: Set<string>,
    private readonly resolver: TsrxSelectorResolver,
    private readonly helpers: Set<string>,
    private readonly decoratorName: string,
  ) {}

  lower(stmt: EstreeNode, fn: EstreeNode): MappedText {
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
    for (const s of block.body as EstreeNode[]) {
      const member = this.getMemberDeclaration(s);
      if (member !== null) {
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

    const metaProps: (string | MappedText)[] = [
      `selector: ${JSON.stringify(defaultSelector(name))}`,
      mt`template: ${jsonLiteral(template)}`.from(block.render),
    ];
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
    const setup = [
      ...aliases,
      ...statements,
      ...this.bindings.map((b) => mt`    ${b}`),
      `    return {${this.keys.map((k) => `${k}: ɵ${k}`).join(', ')}};`,
    ];
    return joinMapped(
      [
        mt`@${this.decoratorName}({\n  ${joinMapped(metaProps, ',\n  ')},\n})`.from(
          fn.id,
        ),
        mt`${exportPrefix}class ${this.copy(fn.id)} {`,
        ...fields,
        mt`  protected readonly ${TSRX_BINDINGS_FIELD} = (() => {`.from(block),
        ...setup,
        '  })();',
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
    if (callee.type !== 'Identifier') {
      return null;
    }
    const imported = this.imports.get(callee.name);
    if (
      imported?.module !== CORE_MODULE ||
      !MEMBER_APIS.has(imported.importedName)
    ) {
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
        throw new TsrxLoweringError(
          node,
          '@try is not supported by the Angular target yet.',
        );
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
    return joinMapped(
      children.map((c) => this.lowerChild(c, scope)),
      '',
    );
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

    if (nameNode.type === 'JSXIdentifier' && /^[A-Z]/.test(nameNode.name)) {
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
      nameNode.type === 'JSXIdentifier' && /^[A-Z]/.test(nameNode.name);
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
      selector = defaultSelector(name);
    } else {
      const imported = this.imports.get(name);
      selector =
        imported === undefined
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
      if (/[{}@]/.test(value.value) || namespace === 'attr') {
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
    if (namespace === null && /^on[A-Z]/.test(name)) {
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
    const css = this.source
      .slice(start, end)
      .replace(/:global\(([^)]*)\)/g, '::ng-deep $1');
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
      if (spec.type !== 'ImportSpecifier' || spec.importKind === 'type') {
        continue;
      }
      const importedName =
        spec.imported.type === 'Identifier'
          ? spec.imported.name
          : String(spec.imported.value);
      imports.set(spec.local.name, { module: stmt.source.value, importedName });
    }
  }
  return imports;
}

function localNameOf(
  imports: Map<string, ImportedName>,
  module: string,
  importedName: string,
): string | null {
  for (const [local, i] of imports) {
    if (i.module === module && i.importedName === importedName) {
      return local;
    }
  }
  return null;
}

function isNameTaken(
  program: EstreeNode,
  imports: Map<string, ImportedName>,
  name: string,
): boolean {
  if (imports.has(name)) {
    return true;
  }
  return (program.body as EstreeNode[]).some((stmt) => {
    const decl =
      stmt.type.startsWith('Export') && stmt.declaration
        ? stmt.declaration
        : stmt;
    if (decl.id?.name === name) {
      return true;
    }
    return (
      decl.type === 'VariableDeclaration' &&
      decl.declarations.some(
        (d: EstreeNode) => d.id.type === 'Identifier' && d.id.name === name,
      )
    );
  });
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

/** Collects identifier references in an expression (not property names or object keys). */
function visitIdentifiers(node: EstreeNode, add: (name: string) => void): void {
  if (node.type === 'Identifier') {
    add(node.name);
    return;
  }
  if (node.type === 'MemberExpression') {
    visitIdentifiers(node.object, add);
    if (node.computed) {
      visitIdentifiers(node.property, add);
    }
    return;
  }
  if (node.type === 'Property' && !node.shorthand) {
    if (node.computed) {
      visitIdentifiers(node.key, add);
    }
    visitIdentifiers(node.value, add);
    return;
  }
  forEachChild(node, (c) => visitIdentifiers(c, add));
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
 * Converts a component selector into the tag and attributes used to instantiate it. Uses the
 * first selector in a comma-separated list; attribute-only selectors are placed on a `<div>`.
 */
function parseSelector(
  selector: string,
): { tagName: string; extraAttrs: string[] } | null {
  const first = selector.split(',')[0].trim();
  const match = /^([a-zA-Z][\w-]*)?((?:\[[^\]=\s]+(?:=[^\]]*)?\])*)$/.exec(
    first,
  );
  if (match === null || (match[1] === undefined && match[2] === '')) {
    return null;
  }
  const extraAttrs: string[] = [];
  for (const attr of match[2].matchAll(/\[([^\]=\s]+)(?:=([^\]]*))?\]/g)) {
    const value = attr[2]?.replace(/^["']|["']$/g, '');
    extraAttrs.push(
      value !== undefined ? `${attr[1]}="${escapeAttr(value)}"` : attr[1],
    );
  }
  return { tagName: match[1] ?? 'div', extraAttrs };
}

/** Applies JSX whitespace semantics: lines are trimmed and blank lines dropped. */
function cleanJsxText(text: string): string {
  const lines = text.split(/\r\n|\n|\r/);
  let lastNonEmpty = 0;
  lines.forEach((line, i) => {
    if (/[^ \t]/.test(line)) {
      lastNonEmpty = i;
    }
  });
  let out = '';
  lines.forEach((raw, i) => {
    let line = raw.replace(/\t/g, ' ');
    if (i !== 0) {
      line = line.replace(/^ +/, '');
    }
    if (i !== lines.length - 1) {
      line = line.replace(/ +$/, '');
    }
    if (line !== '') {
      out += i !== lastNonEmpty ? line + ' ' : line;
    }
  });
  return out;
}

function escapeText(text: string): string {
  return text
    .replace(/@/g, '&#64;')
    .replace(/\{/g, '&#123;')
    .replace(/\}/g, '&#125;');
}

function singleQuoted(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function params(locals: Local[]): string {
  return locals.map((l) => `${l.name}: ${l.type}`).join(', ');
}
