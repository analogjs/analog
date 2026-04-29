import * as ts from 'typescript';
import * as o from '@angular/compiler';

/** Shared printer — only used as fallback for complex WrappedNodeExpr (e.g. decorator args). */
const sharedPrinter = ts.createPrinter({ removeComments: true });
const emptySourceFile = ts.createSourceFile(
  '_.ts',
  '',
  ts.ScriptTarget.Latest,
  false,
);

// Operator metadata table — name, JS string, and precedence (higher = tighter
// binding). Used to build version-aware lookup maps below.
//
// Why a runtime build instead of static `[o.BinaryOperator.Equals]: '=='`
// literals: Angular's `BinaryOperator` enum gains members between major
// versions (Assign and the 9 compound assignments were added in v21,
// Exponentiation/In in v20, InstanceOf in v21). On older Angular versions
// the missing members evaluate to `undefined` at module load time, and
// every `[undefined]: '...'` entry collides on the single string key
// `"undefined"` — last write wins. Pre-Phase-1, that gave the v19 install
// `BINARY_OP_STR["undefined"] === '??='`, so any expression with an
// unknown operator emitted `??=` instead of failing loudly. Building the
// table by iterating known names and skipping `undefined` values
// eliminates the collision: members that don't exist on the installed
// Angular are simply absent from the map.
//
// Precedence values match MDN's table, skipping levels not used by Angular
// (bitwise XOR, shifts).
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Operator_precedence
const OP_DEFINITIONS: ReadonlyArray<
  readonly [name: string, str: string, precedence: number]
> = [
  ['Assign', '=', 2],
  ['AdditionAssignment', '+=', 2],
  ['SubtractionAssignment', '-=', 2],
  ['MultiplicationAssignment', '*=', 2],
  ['DivisionAssignment', '/=', 2],
  ['RemainderAssignment', '%=', 2],
  ['ExponentiationAssignment', '**=', 2],
  ['AndAssignment', '&&=', 2],
  ['OrAssignment', '||=', 2],
  ['NullishCoalesceAssignment', '??=', 2],
  ['NullishCoalesce', '??', 4],
  ['Or', '||', 4],
  ['And', '&&', 5],
  ['BitwiseOr', '|', 6],
  ['BitwiseAnd', '&', 8],
  ['Equals', '==', 9],
  ['NotEquals', '!=', 9],
  ['Identical', '===', 9],
  ['NotIdentical', '!==', 9],
  ['Lower', '<', 10],
  ['LowerEquals', '<=', 10],
  ['Bigger', '>', 10],
  ['BiggerEquals', '>=', 10],
  ['In', 'in', 10],
  ['InstanceOf', 'instanceof', 10],
  ['Plus', '+', 12],
  ['Minus', '-', 12],
  ['Multiply', '*', 13],
  ['Divide', '/', 13],
  ['Modulo', '%', 13],
  ['Exponentiation', '**', 14],
];

/** Operator integer values that represent assignment forms (`=`, `+=`, etc.). */
const ASSIGNMENT_OP_NAMES: ReadonlySet<string> = new Set([
  'Assign',
  'AdditionAssignment',
  'SubtractionAssignment',
  'MultiplicationAssignment',
  'DivisionAssignment',
  'RemainderAssignment',
  'ExponentiationAssignment',
  'AndAssignment',
  'OrAssignment',
  'NullishCoalesceAssignment',
]);

const BINARY_OP_STR = new Map<number, string>();
const BINARY_PRECEDENCE = new Map<number, number>();
const ASSIGNMENT_OP_VALUES = new Set<number>();

for (const [name, str, precedence] of OP_DEFINITIONS) {
  const value = (o.BinaryOperator as Record<string, unknown>)[name];
  if (typeof value !== 'number') continue;
  BINARY_OP_STR.set(value, str);
  BINARY_PRECEDENCE.set(value, precedence);
  if (ASSIGNMENT_OP_NAMES.has(name)) {
    ASSIGNMENT_OP_VALUES.add(value);
  }
}

/** Returns true when `op` represents any kind of assignment (`=`, `+=`, etc.). */
function isAssignmentOperator(op: o.BinaryOperator): boolean {
  return ASSIGNMENT_OP_VALUES.has(op);
}

/**
 * Determine whether a child expression needs parentheses when it appears
 * as an operand of `parentOp`.
 */
function childNeedsParens(
  parentOp: o.BinaryOperator,
  child: o.Expression,
  isRhs: boolean,
): boolean {
  if (!(child instanceof o.BinaryOperatorExpr)) return false;

  const childOp = child.operator;
  const parentPrec = BINARY_PRECEDENCE.get(parentOp);
  const childPrec = BINARY_PRECEDENCE.get(childOp);
  if (parentPrec === undefined || childPrec === undefined) return false;

  // ?? cannot appear with || or && without explicit grouping (JS spec)
  if (
    (parentOp === o.BinaryOperator.NullishCoalesce &&
      (childOp === o.BinaryOperator.And || childOp === o.BinaryOperator.Or)) ||
    (childOp === o.BinaryOperator.NullishCoalesce &&
      (parentOp === o.BinaryOperator.And || parentOp === o.BinaryOperator.Or))
  ) {
    return true;
  }

  // Child has strictly lower precedence
  if (childPrec < parentPrec) return true;

  // Same precedence — depends on associativity and position
  if (childPrec === parentPrec) {
    // ** is right-associative: LHS same-prec needs parens, RHS does not
    if (parentOp === o.BinaryOperator.Exponentiation) return !isRhs;
    // All other ops are left-associative: RHS same-prec needs parens
    return isRhs;
  }

  return false;
}

/**
 * Wrap a receiver expression in parens when emitting `<receiver>.name` or
 * `<receiver>.name(args)`. Two cases produce a JS parse error otherwise:
 *
 * 1. A `BinaryOperatorExpr` receiver: `a / 3600.toFixed(2)` parses as
 *    `a / 3600.toFixed(2)` where `3600.toFixed` is read as the start of a
 *    decimal literal followed by an identifier — an "Invalid characters
 *    after number" error. Wrapping gives `(a / 3600).toFixed(2)`.
 * 2. A non-negative integer `LiteralExpr` receiver: `42.toFixed(2)` is
 *    invalid for the same decimal-literal-ambiguity reason. Wrapping gives
 *    `(42).toFixed(2)`. Negative numbers are already emitted as `(-42)` by
 *    `visitLiteralExpr`. Floats (e.g. `4.5.toFixed`) and strings parse fine.
 *
 * Other expression kinds either already self-wrap (`ConditionalExpr`,
 * `UnaryOperatorExpr`) or are primary forms that don't need parens
 * (`ReadVarExpr`, `ReadPropExpr`, `InvokeFunctionExpr`, etc.).
 */
function emitReceiverForMemberAccess(
  receiver: o.Expression,
  emitted: string,
): string {
  if (receiver instanceof o.BinaryOperatorExpr) return '(' + emitted + ')';
  if (
    receiver instanceof o.LiteralExpr &&
    typeof receiver.value === 'number' &&
    receiver.value >= 0
  ) {
    return '(' + emitted + ')';
  }
  return emitted;
}

/** Polyfill for `__makeTemplateObject` used in downleveled `$localize` calls. */
const MAKE_TEMPLATE_OBJECT_POLYFILL =
  '(this&&this.__makeTemplateObject||function(e,t){return Object.defineProperty?Object.defineProperty(e,"raw",{value:t}):e.raw=t,e})';

const SINGLE_QUOTE_ESCAPE_RE = /[\\\'\n\r]/g;

/** Escape a string for use as a single-quoted string literal. */
function escapeForLocalize(input: string): string {
  const body = input.replace(SINGLE_QUOTE_ESCAPE_RE, (match) => {
    if (match === '\n') return '\\n';
    if (match === '\r') return '\\r';
    return `\\${match}`;
  });
  return `'${body}'`;
}

/**
 * Emits Angular output AST directly to JavaScript strings, bypassing
 * ts.factory node creation and ts.Printer serialization (~4x faster).
 */
class JSEmitter implements o.ExpressionVisitor, o.StatementVisitor {
  /** Set by compile() so WrappedNodeExpr fallback can print with correct source context. */
  static _currentSourceFile: ts.SourceFile | undefined;
  /** Set by compile() so OXC-based WrappedNodeExpr can slice original source. */
  static _currentSourceCode: string | undefined;

  private emitExpr(e: any): string {
    if (!e) return 'null';
    if (typeof e.visitExpression === 'function')
      return e.visitExpression(this, null);
    // Angular v21 LiteralMapPropertyAssignment: {key, value, quoted}
    if ('key' in e && 'value' in e) {
      const key = e.quoted ? JSON.stringify(e.key) : e.key;
      return key + ': ' + this.emitExpr(e.value);
    }
    return 'null';
  }
  visitWrappedNodeExpr(ast: o.WrappedNodeExpr<any>) {
    const node = ast.node;

    // Raw source text: already resolved to a string at wrap time
    if (typeof node === 'string') return node;

    // OXC AST nodes: identified by string `type` property + numeric start/end
    if (typeof node.type === 'string' && typeof node.start === 'number') {
      const src = JSEmitter._currentSourceCode;
      if (node.type === 'Identifier') return node.name;
      if (node.type === 'StringLiteral') return JSON.stringify(node.value);
      if (node.type === 'NumericLiteral') return String(node.value);
      if (node.type === 'BooleanLiteral') return node.value ? 'true' : 'false';
      if (node.type === 'NullLiteral') return 'null';
      if (node.type === 'TemplateLiteral' && !node.expressions?.length)
        return '`' + node.quasis[0].value.raw + '`';
      // Fallback: slice original source for complex OXC nodes
      if (src) return src.slice(node.start, node.end);
      return 'null';
    }

    // TypeScript AST nodes: identified by numeric `kind` property
    if (node.kind === ts.SyntaxKind.Identifier)
      return (node as ts.Identifier).escapedText as string;
    if (node.kind === ts.SyntaxKind.StringLiteral)
      return JSON.stringify((node as ts.StringLiteral).text);
    if (node.kind === ts.SyntaxKind.NumericLiteral)
      return (node as ts.NumericLiteral).text;
    if (node.kind === ts.SyntaxKind.TrueKeyword) return 'true';
    if (node.kind === ts.SyntaxKind.FalseKeyword) return 'false';
    if (node.kind === ts.SyntaxKind.NullKeyword) return 'null';
    if (node.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral)
      return '`' + (node as ts.NoSubstitutionTemplateLiteral).text + '`';
    // Fallback for complex wrapped TS nodes (e.g. decorator arguments, array literals).
    // Use currentSourceFile when available for correct position-based printing.
    return sharedPrinter.printNode(
      ts.EmitHint.Unspecified,
      node,
      JSEmitter._currentSourceFile || emptySourceFile,
    );
  }
  visitExternalExpr(ast: o.ExternalExpr) {
    const name = ast.value.name;
    if (name === 'ngDevMode') return name;
    // When name is null/undefined, this is a bare module reference (e.g. ngImport: i0)
    if (!name) return 'i0';
    return 'i0.' + name;
  }
  visitLiteralExpr(ast: o.LiteralExpr) {
    const v = ast.value;
    if (typeof v === 'string') return JSON.stringify(v);
    if (typeof v === 'number') return v < 0 ? '(-' + -v + ')' : '' + v;
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (v === undefined) return 'void 0';
    return 'null';
  }
  visitLiteralArrayExpr(ast: o.LiteralArrayExpr) {
    return '[' + ast.entries.map((e) => this.emitExpr(e)).join(', ') + ']';
  }
  visitLiteralMapExpr(ast: o.LiteralMapExpr) {
    return '{' + ast.entries.map((e) => this.emitExpr(e)).join(', ') + '}';
  }
  visitInvokeFunctionExpr(ast: o.InvokeFunctionExpr) {
    const fn = ast.fn.visitExpression(this, null);
    const args = ast.args.map((a: any) => this.emitExpr(a)).join(', ');
    // Wrap arrow/function expressions in parens for valid IIFE syntax
    if (
      ast.fn instanceof o.ArrowFunctionExpr ||
      ast.fn instanceof o.FunctionExpr
    ) {
      return '(' + fn + ')(' + args + ')';
    }
    return fn + '(' + args + ')';
  }
  visitReadVarExpr(ast: o.ReadVarExpr) {
    if (ast.name === 'this') return 'this';
    if (ast.name === 'super') return 'super';
    return ast.name!;
  }
  visitReadPropExpr(ast: o.ReadPropExpr) {
    const receiver = ast.receiver.visitExpression(this, null);
    return emitReceiverForMemberAccess(ast.receiver, receiver) + '.' + ast.name;
  }
  visitReadKeyExpr(ast: o.ReadKeyExpr) {
    const receiver = ast.receiver.visitExpression(this, null);
    return (
      emitReceiverForMemberAccess(ast.receiver, receiver) +
      '[' +
      ast.index.visitExpression(this, null) +
      ']'
    );
  }
  visitConditionalExpr(ast: o.ConditionalExpr) {
    return (
      '(' +
      ast.condition.visitExpression(this, null) +
      ' ? ' +
      ast.trueCase.visitExpression(this, null) +
      ' : ' +
      ast.falseCase!.visitExpression(this, null) +
      ')'
    );
  }
  visitBinaryOperatorExpr(ast: o.BinaryOperatorExpr) {
    // `BINARY_OP_STR.get(...)` returns `undefined` when the operator value
    // doesn't exist in the installed Angular's `BinaryOperator` enum (the
    // enum is missing 13 members on v19, 11 on v20). Falling back to `'='`
    // would silently produce wrong code; instead, we throw so the error
    // surfaces in the DEBUG output and the calling test fails loudly.
    const op = BINARY_OP_STR.get(ast.operator);
    if (op === undefined) {
      throw new Error(
        `[fast-compile] Unsupported BinaryOperator value ${ast.operator} ` +
          `on @angular/compiler ${o.VERSION?.full ?? '(unknown version)'}`,
      );
    }

    const lhsRaw = ast.lhs.visitExpression(this, null);
    const rhsRaw = ast.rhs.visitExpression(this, null);

    const lhs = childNeedsParens(ast.operator, ast.lhs, false)
      ? '(' + lhsRaw + ')'
      : lhsRaw;
    const rhs = childNeedsParens(ast.operator, ast.rhs, true)
      ? '(' + rhsRaw + ')'
      : rhsRaw;

    const expr = lhs + ' ' + op + ' ' + rhs;

    // Wrap assignments in parens so they work correctly as ternary conditions:
    //   (tmp = val) ? a : b   vs   tmp = val ? a : b
    //
    // `isAssignmentOperator` is built at module load time from the operator
    // names that actually exist on the installed Angular's enum. This
    // works whether `Assign` is present (v21+) or absent (v19/v20) — on
    // older versions the assignment branch is simply unreachable because
    // Angular's compiler never constructs an Assign-operator expression.
    if (isAssignmentOperator(ast.operator)) {
      return '(' + expr + ')';
    }
    return expr;
  }
  visitNotExpr(ast: o.NotExpr) {
    return '!(' + ast.condition.visitExpression(this, null) + ')';
  }
  visitFunctionExpr(ast: o.FunctionExpr) {
    return (
      '(' +
      ast.params.map((p: any) => p.name).join(', ') +
      ') => {' +
      ast.statements.map((s: any) => s.visitStatement(this, null)).join(' ') +
      '}'
    );
  }
  visitArrowFunctionExpr(ast: o.ArrowFunctionExpr) {
    const params = '(' + ast.params.map((p: any) => p.name).join(', ') + ')';
    if (Array.isArray(ast.body))
      return (
        params +
        ' => {' +
        ast.body.map((s: any) => s.visitStatement(this, null)).join(' ') +
        '}'
      );
    const bodyExpr = (ast.body as o.Expression).visitExpression(this, null);
    // Wrap object literals in parens so `() => {key: val}` isn't parsed
    // as a block with a labeled statement.
    if (ast.body instanceof o.LiteralMapExpr) {
      return params + ' => (' + bodyExpr + ')';
    }
    return params + ' => ' + bodyExpr;
  }
  // `Write*Expr` visitors must wrap the assignment in parentheses so that
  // it composes correctly when nested inside higher-precedence parents
  // (e.g. as the test of a `ConditionalExpr`). Without the wrapping,
  //   tmp = ctx.data() ? 0 : -1
  // parses as `tmp = (ctx.data() ? 0 : -1)` because assignment binds
  // looser than the ternary, which silently assigns the wrong value to
  // `tmp`. Angular's own `AbstractEmitterVisitor.visitWriteVarExpr`
  // applies the same context-sensitive wrapping (it skips the parens
  // when the assignment is a top-level statement to avoid `(x = 1);`
  // noise; we always wrap for simplicity — the redundant parens at
  // statement level are harmless).
  //
  // This matters specifically on Angular v19/v20, where assignment is
  // represented in the IR via `WriteVarExpr` / `AssignTemporaryExpr →
  // WriteVarExpr`. On v21+ the same construct is represented via
  // `BinaryOperatorExpr(Assign, ...)`, which `visitBinaryOperatorExpr`
  // already wraps via `isAssignmentOperator`. Without these wrappers,
  // `@if (data(); as item)` and similar conditional alias forms emit
  // runtime-broken code on v19/v20.
  visitWriteVarExpr(ast: any) {
    return '(' + ast.name + ' = ' + ast.value.visitExpression(this, null) + ')';
  }
  visitWritePropExpr(ast: any) {
    return (
      '(' +
      ast.receiver.visitExpression(this, null) +
      '.' +
      ast.name +
      ' = ' +
      ast.value.visitExpression(this, null) +
      ')'
    );
  }
  visitWriteKeyExpr(ast: any) {
    return (
      '(' +
      ast.receiver.visitExpression(this, null) +
      '[' +
      ast.index.visitExpression(this, null) +
      '] = ' +
      ast.value.visitExpression(this, null) +
      ')'
    );
  }
  visitInvokeMethodExpr(ast: any) {
    const receiver = ast.receiver.visitExpression(this, null);
    return (
      emitReceiverForMemberAccess(ast.receiver, receiver) +
      '.' +
      ast.name +
      '(' +
      ast.args.map((a: any) => this.emitExpr(a)).join(', ') +
      ')'
    );
  }
  visitTypeofExpr(ast: o.TypeofExpr) {
    return 'typeof ' + ast.expr.visitExpression(this, null);
  }
  visitUnaryOperatorExpr(ast: o.UnaryOperatorExpr) {
    return '-(' + ast.expr.visitExpression(this, null) + ')';
  }
  visitInstantiateExpr(ast: o.InstantiateExpr) {
    return (
      'new (' +
      ast.classExpr.visitExpression(this, null) +
      ')(' +
      ast.args.map((a: any) => this.emitExpr(a)).join(', ') +
      ')'
    );
  }
  visitCommaExpr(ast: o.CommaExpr) {
    return ast.parts.map((p: any) => p.visitExpression(this, null)).join(', ');
  }
  visitParenthesizedExpr(ast: o.ParenthesizedExpr) {
    return '(' + ast.expr.visitExpression(this, null) + ')';
  }
  visitVoidExpr(ast: o.VoidExpr) {
    return 'void ' + ast.expr.visitExpression(this, null);
  }
  visitSpreadElementExpr(ast: o.SpreadElementExpr) {
    return '...' + (ast as any).expression.visitExpression(this, null);
  }
  visitDynamicImportExpr(ast: o.DynamicImportExpr) {
    return (
      'import(' +
      (typeof ast.url === 'string'
        ? JSON.stringify(ast.url)
        : ast.url.visitExpression(this, null)) +
      ')'
    );
  }
  visitTemplateLiteralExpr(ast: o.TemplateLiteralExpr) {
    return (
      '`' +
      ast.elements[0].text +
      ast.expressions
        .map(
          (e: any, i: number) =>
            '${' +
            e.visitExpression(this, null) +
            '}' +
            ast.elements[i + 1].text,
        )
        .join('') +
      '`'
    );
  }
  visitTaggedTemplateLiteralExpr(ast: any) {
    const elements = ast.template.elements;
    const expressions = ast.template.expressions;
    const head = elements[0].text;
    const spans = expressions
      .map(
        (e: any, i: number) =>
          '${' + e.visitExpression(this, null) + '}' + elements[i + 1].text,
      )
      .join('');
    return ast.tag.visitExpression(this, null) + '`' + head + spans + '`';
  }
  visitLocalizedString(ast: o.LocalizedString) {
    // Emit the downleveled form:
    //   $localize(makeTemplateObject(cooked, raw), expr1, expr2, ...)
    const parts: { cooked: string; raw: string }[] = [ast.serializeI18nHead()];
    for (let i = 1; i < ast.messageParts.length; i++) {
      parts.push(ast.serializeI18nTemplatePart(i));
    }
    const cooked = parts.map((p) => escapeForLocalize(p.cooked)).join(', ');
    const raw = parts.map((p) => escapeForLocalize(p.raw)).join(', ');
    const exprs = ast.expressions.map((e) => this.emitExpr(e));
    return (
      '$localize(' +
      MAKE_TEMPLATE_OBJECT_POLYFILL +
      '([' +
      cooked +
      '], [' +
      raw +
      '])' +
      (exprs.length > 0 ? ', ' + exprs.join(', ') : '') +
      ')'
    );
  }
  visitRegularExpressionLiteral(ast: any) {
    return '/' + (ast.body ?? ast.pattern) + '/' + ast.flags;
  }
  visitTemplateLiteralElementExpr(ast: o.TemplateLiteralElementExpr) {
    return JSON.stringify(ast.text);
  }
  // Statement visitors
  visitReturnStmt(stmt: o.ReturnStatement) {
    return 'return ' + stmt.value.visitExpression(this, null) + ';';
  }
  visitExpressionStmt(stmt: o.ExpressionStatement) {
    return stmt.expr.visitExpression(this, null) + ';';
  }
  visitIfStmt(stmt: o.IfStmt) {
    let s =
      'if (' +
      stmt.condition.visitExpression(this, null) +
      ') {' +
      stmt.trueCase.map((s2: any) => s2.visitStatement(this, null)).join(' ') +
      '}';
    if (stmt.falseCase.length)
      s +=
        ' else {' +
        stmt.falseCase
          .map((s2: any) => s2.visitStatement(this, null))
          .join(' ') +
        '}';
    return s;
  }
  visitDeclareVarStmt(stmt: o.DeclareVarStmt) {
    const kw = stmt.hasModifier(o.StmtModifier.Final) ? 'const' : 'let';
    return (
      kw +
      ' ' +
      stmt.name +
      (stmt.value ? ' = ' + stmt.value.visitExpression(this, null) : '') +
      ';'
    );
  }
  visitDeclareFunctionStmt(stmt: o.DeclareFunctionStmt) {
    return (
      'function ' +
      stmt.name +
      '(' +
      stmt.params.map((p: any) => p.name).join(', ') +
      ') {' +
      stmt.statements.map((s: any) => s.visitStatement(this, null)).join(' ') +
      '}'
    );
  }
}

const stringEmitter = new JSEmitter();

/** Emit Angular output AST expression directly to a JavaScript string. */
export function emitAngularExpr(expr: o.Expression): string {
  return expr.visitExpression(stringEmitter, null);
}

/** Emit Angular output AST statement directly to a JavaScript string. */
export function emitAngularStmt(stmt: o.Statement): string {
  return stmt.visitStatement(stringEmitter, null);
}

/** Set the current source file for WrappedNodeExpr fallback printing. */
export function setEmitterSourceFile(sf: ts.SourceFile | undefined): void {
  JSEmitter._currentSourceFile = sf;
}

/** Set the current source code for OXC-based WrappedNodeExpr slice fallback. */
export function setEmitterSourceCode(code: string | undefined): void {
  JSEmitter._currentSourceCode = code;
}
