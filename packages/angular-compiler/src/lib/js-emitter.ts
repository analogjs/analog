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

const BINARY_OP_STR: Record<number, string> = {
  [o.BinaryOperator.Equals]: '==',
  [o.BinaryOperator.NotEquals]: '!=',
  [o.BinaryOperator.Assign]: '=',
  [o.BinaryOperator.Identical]: '===',
  [o.BinaryOperator.NotIdentical]: '!==',
  [o.BinaryOperator.Minus]: '-',
  [o.BinaryOperator.Plus]: '+',
  [o.BinaryOperator.Divide]: '/',
  [o.BinaryOperator.Multiply]: '*',
  [o.BinaryOperator.Modulo]: '%',
  [o.BinaryOperator.And]: '&&',
  [o.BinaryOperator.Or]: '||',
  [o.BinaryOperator.BitwiseOr]: '|',
  [o.BinaryOperator.BitwiseAnd]: '&',
  [o.BinaryOperator.Lower]: '<',
  [o.BinaryOperator.LowerEquals]: '<=',
  [o.BinaryOperator.Bigger]: '>',
  [o.BinaryOperator.BiggerEquals]: '>=',
  [o.BinaryOperator.NullishCoalesce]: '??',
  [o.BinaryOperator.Exponentiation]: '**',
  [o.BinaryOperator.In]: 'in',
  [o.BinaryOperator.InstanceOf]: 'instanceof',
  [o.BinaryOperator.AdditionAssignment]: '+=',
  [o.BinaryOperator.SubtractionAssignment]: '-=',
  [o.BinaryOperator.MultiplicationAssignment]: '*=',
  [o.BinaryOperator.DivisionAssignment]: '/=',
  [o.BinaryOperator.RemainderAssignment]: '%=',
  [o.BinaryOperator.ExponentiationAssignment]: '**=',
  [o.BinaryOperator.AndAssignment]: '&&=',
  [o.BinaryOperator.OrAssignment]: '||=',
  [o.BinaryOperator.NullishCoalesceAssignment]: '??=',
};

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
    const name = ast.value.name!;
    if (name === 'ngDevMode') return name;
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
    return ast.receiver.visitExpression(this, null) + '.' + ast.name;
  }
  visitReadKeyExpr(ast: o.ReadKeyExpr) {
    return (
      ast.receiver.visitExpression(this, null) +
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
    const op = BINARY_OP_STR[ast.operator] || '=';
    const expr =
      ast.lhs.visitExpression(this, null) +
      ' ' +
      op +
      ' ' +
      ast.rhs.visitExpression(this, null);
    // Wrap assignments in parens so they work correctly as ternary conditions:
    // (tmp = val) ? a : b  vs  tmp = val ? a : b
    if (ast.operator === o.BinaryOperator.Assign) {
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
  visitWriteVarExpr(ast: any) {
    return ast.name + ' = ' + ast.value.visitExpression(this, null);
  }
  visitWritePropExpr(ast: any) {
    return (
      ast.receiver.visitExpression(this, null) +
      '.' +
      ast.name +
      ' = ' +
      ast.value.visitExpression(this, null)
    );
  }
  visitWriteKeyExpr(ast: any) {
    return (
      ast.receiver.visitExpression(this, null) +
      '[' +
      ast.index.visitExpression(this, null) +
      '] = ' +
      ast.value.visitExpression(this, null)
    );
  }
  visitInvokeMethodExpr(ast: any) {
    return (
      ast.receiver.visitExpression(this, null) +
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
  visitLocalizedString() {
    throw new Error('i18n not supported');
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
