import * as o from '@angular/compiler';
import * as ts from 'typescript';

const BINARY_OP_MAP: Record<o.BinaryOperator, ts.BinaryOperator> = {
  [o.BinaryOperator.Equals]: ts.SyntaxKind.EqualsEqualsToken,
  [o.BinaryOperator.NotEquals]: ts.SyntaxKind.ExclamationEqualsToken,
  [o.BinaryOperator.Assign]: ts.SyntaxKind.EqualsToken,
  [o.BinaryOperator.Identical]: ts.SyntaxKind.EqualsEqualsEqualsToken,
  [o.BinaryOperator.NotIdentical]: ts.SyntaxKind.ExclamationEqualsEqualsToken,
  [o.BinaryOperator.Minus]: ts.SyntaxKind.MinusToken,
  [o.BinaryOperator.Plus]: ts.SyntaxKind.PlusToken,
  [o.BinaryOperator.Divide]: ts.SyntaxKind.SlashToken,
  [o.BinaryOperator.Multiply]: ts.SyntaxKind.AsteriskToken,
  [o.BinaryOperator.Modulo]: ts.SyntaxKind.PercentToken,
  [o.BinaryOperator.And]: ts.SyntaxKind.AmpersandAmpersandToken,
  [o.BinaryOperator.Or]: ts.SyntaxKind.BarBarToken,
  [o.BinaryOperator.BitwiseOr]: ts.SyntaxKind.BarToken,
  [o.BinaryOperator.BitwiseAnd]: ts.SyntaxKind.AmpersandToken,
  [o.BinaryOperator.Lower]: ts.SyntaxKind.LessThanToken,
  [o.BinaryOperator.LowerEquals]: ts.SyntaxKind.LessThanEqualsToken,
  [o.BinaryOperator.Bigger]: ts.SyntaxKind.GreaterThanToken,
  [o.BinaryOperator.BiggerEquals]: ts.SyntaxKind.GreaterThanEqualsToken,
  [o.BinaryOperator.NullishCoalesce]: ts.SyntaxKind.QuestionQuestionToken,
  [o.BinaryOperator.Exponentiation]: ts.SyntaxKind.AsteriskAsteriskToken,
  [o.BinaryOperator.In]: ts.SyntaxKind.InKeyword,
  [o.BinaryOperator.InstanceOf]: ts.SyntaxKind.InstanceOfKeyword,
  [o.BinaryOperator.AdditionAssignment]: ts.SyntaxKind.PlusEqualsToken,
  [o.BinaryOperator.SubtractionAssignment]: ts.SyntaxKind.MinusEqualsToken,
  [o.BinaryOperator.MultiplicationAssignment]:
    ts.SyntaxKind.AsteriskEqualsToken,
  [o.BinaryOperator.DivisionAssignment]: ts.SyntaxKind.SlashEqualsToken,
  [o.BinaryOperator.RemainderAssignment]: ts.SyntaxKind.PercentEqualsToken,
  [o.BinaryOperator.ExponentiationAssignment]:
    ts.SyntaxKind.AsteriskAsteriskEqualsToken,
  [o.BinaryOperator.AndAssignment]: ts.SyntaxKind.AmpersandAmpersandEqualsToken,
  [o.BinaryOperator.OrAssignment]: ts.SyntaxKind.BarBarEqualsToken,
  [o.BinaryOperator.NullishCoalesceAssignment]:
    ts.SyntaxKind.QuestionQuestionEqualsToken,
};

const UNARY_OP_MAP: Record<number, ts.PrefixUnaryOperator> = {
  [o.UnaryOperator.Minus]: ts.SyntaxKind.MinusToken,
  [o.UnaryOperator.Plus]: ts.SyntaxKind.PlusToken,
};

export class AstTranslator implements o.ExpressionVisitor, o.StatementVisitor {
  // --- Non-exported or Version-Specific Expression Methods ---

  visitWritePropExpr(ast: any, context: any) {
    return ts.factory.createBinaryExpression(
      ast.receiver.visitExpression(this, context),
      ts.SyntaxKind.EqualsToken,
      ast.value.visitExpression(this, context),
    );
  }

  visitInvokeMethodExpr(ast: any, context: any) {
    return ts.factory.createCallExpression(
      ts.factory.createPropertyAccessExpression(
        ast.receiver.visitExpression(this, context),
        ast.name,
      ),
      undefined,
      ast.args.map((a: any) => a.visitExpression(this, context)),
    );
  }

  visitWriteVarExpr(ast: any, context: any) {
    return ts.factory.createBinaryExpression(
      ts.factory.createIdentifier(ast.name),
      ts.SyntaxKind.EqualsToken,
      ast.value.visitExpression(this, context),
    );
  }

  visitWriteKeyExpr(ast: any, context: any) {
    return ts.factory.createBinaryExpression(
      ts.factory.createElementAccessExpression(
        ast.receiver.visitExpression(this, context),
        ast.index.visitExpression(this, context),
      ),
      ts.SyntaxKind.EqualsToken,
      ast.value.visitExpression(this, context),
    );
  }

  visitTaggedTemplateLiteralExpr(ast: any, context: any) {
    const elements = ast.template.elements;
    const expressions = ast.template.expressions;

    const head = ts.factory.createTemplateHead(
      elements[0].text,
      elements[0].text,
    );
    const spans = expressions.map((expr: any, i: number) => {
      const element = elements[i + 1];
      const literal =
        i === expressions.length - 1
          ? ts.factory.createTemplateTail(element.text, element.text)
          : ts.factory.createTemplateMiddle(element.text, element.text);
      return ts.factory.createTemplateSpan(
        expr.visitExpression(this, context),
        literal,
      );
    });

    return ts.factory.createTaggedTemplateExpression(
      ast.tag.visitExpression(this, context),
      undefined,
      ts.factory.createTemplateExpression(head, spans),
    );
  }

  // --- Standard Expression Visitor Methods ---

  // Support Defer dependency tracking variables
  visitReadVarExpr(ast: o.ReadVarExpr, context: any) {
    if (ast.name === 'this') return ts.factory.createThis();
    if (ast.name === 'super') return ts.factory.createSuper();
    return ts.factory.createIdentifier(ast.name);
  }

  visitReadPropExpr(ast: o.ReadPropExpr, context: any) {
    return ts.factory.createPropertyAccessExpression(
      ast.receiver.visitExpression(this, context),
      ast.name,
    );
  }

  visitReadKeyExpr(ast: o.ReadKeyExpr, context: any) {
    return ts.factory.createElementAccessExpression(
      ast.receiver.visitExpression(this, context),
      ast.index.visitExpression(this, context),
    );
  }

  visitLiteralExpr(ast: o.LiteralExpr, context: any) {
    if (typeof ast.value === 'string') {
      return ts.factory.createStringLiteral(ast.value);
    }
    if (typeof ast.value === 'number') {
      if (ast.value < 0) {
        return ts.factory.createPrefixUnaryExpression(
          ts.SyntaxKind.MinusToken,
          ts.factory.createNumericLiteral(Math.abs(ast.value).toString()),
        );
      }
      return ts.factory.createNumericLiteral(ast.value.toString());
    }
    if (typeof ast.value === 'boolean')
      return ast.value ? ts.factory.createTrue() : ts.factory.createFalse();
    if (typeof ast.value === 'undefined')
      return ts.factory.createVoidExpression(
        ts.factory.createNumericLiteral('0'),
      );
    return ts.factory.createNull();
  }

  visitLiteralArrayExpr(ast: o.LiteralArrayExpr, context: any) {
    return ts.factory.createArrayLiteralExpression(
      ast.entries.map((e) => {
        // Safety check: sometimes the compiler emits null entries for empty slots
        if (!e) return ts.factory.createNull();
        return e.visitExpression(this, context);
      }),
      true,
    );
  }

  visitSpreadElementExpr(ast: o.SpreadElementExpr, context: any) {
    return ts.factory.createSpreadElement(
      ast.expression.visitExpression(this, context),
    );
  }

  visitLiteralMapExpr(ast: o.LiteralMapExpr, context: any) {
    return ts.factory.createObjectLiteralExpression(
      ast.entries.map((e) => {
        if (e instanceof o.LiteralMapSpreadAssignment) {
          return ts.factory.createSpreadAssignment(
            e.expression.visitExpression(this, context),
          );
        }
        const prop = e as o.LiteralMapPropertyAssignment;
        return ts.factory.createPropertyAssignment(
          prop.quoted
            ? ts.factory.createStringLiteral(prop.key)
            : ts.factory.createIdentifier(prop.key),
          prop.value
            ? prop.value.visitExpression(this, context)
            : ts.factory.createNull(),
        );
      }),
      true,
    );
  }

  // Ensure visitInvokeFunctionExpr is fully mapping all arguments for v21
  visitInvokeFunctionExpr(ast: o.InvokeFunctionExpr, context: any) {
    return ts.factory.createCallExpression(
      ast.fn.visitExpression(this, context),
      undefined,
      ast.args.map((a) => a.visitExpression(this, context)),
    );
  }

  visitInstantiateExpr(ast: o.InstantiateExpr, context: any) {
    return ts.factory.createNewExpression(
      ast.classExpr.visitExpression(this, context),
      undefined,
      ast.args.map((a) => a.visitExpression(this, context)),
    );
  }

  visitTemplateLiteralExpr(ast: o.TemplateLiteralExpr, context: any) {
    const headText = ast.elements[0].text;
    const head = ts.factory.createTemplateHead(headText, headText);
    const spans = ast.expressions.map((expr, i) => {
      const isLast = i === ast.expressions.length - 1;
      const content = ast.elements[i + 1].text;
      const literal = isLast
        ? ts.factory.createTemplateTail(content, content)
        : ts.factory.createTemplateMiddle(content, content);
      return ts.factory.createTemplateSpan(
        expr.visitExpression(this, context),
        literal,
      );
    });
    return ts.factory.createTemplateExpression(head, spans);
  }

  visitBinaryOperatorExpr(ast: o.BinaryOperatorExpr, context: any) {
    const op = BINARY_OP_MAP[ast.operator];
    if (op === undefined) {
      throw new Error(`Unsupported binary operator: ${ast.operator}`);
    }
    return ts.factory.createBinaryExpression(
      ast.lhs.visitExpression(this, context),
      op,
      ast.rhs.visitExpression(this, context),
    );
  }

  visitConditionalExpr(ast: o.ConditionalExpr, context: any) {
    return ts.factory.createConditionalExpression(
      ast.condition.visitExpression(this, context),
      ts.factory.createToken(ts.SyntaxKind.QuestionToken),
      ast.trueCase.visitExpression(this, context),
      ts.factory.createToken(ts.SyntaxKind.ColonToken),
      ast.falseCase!.visitExpression(this, context),
    );
  }

  visitNotExpr(ast: o.NotExpr, context: any) {
    return ts.factory.createPrefixUnaryExpression(
      ts.SyntaxKind.ExclamationToken,
      ast.condition.visitExpression(this, context),
    );
  }

  visitTypeofExpr(ast: o.TypeofExpr, context: any) {
    return ts.factory.createTypeOfExpression(
      ast.expr.visitExpression(this, context),
    );
  }

  visitUnaryOperatorExpr(ast: o.UnaryOperatorExpr, context: any) {
    const op = UNARY_OP_MAP[ast.operator];
    if (op === undefined) {
      throw new Error(`Unsupported unary operator: ${ast.operator}`);
    }
    return ts.factory.createPrefixUnaryExpression(
      op,
      ast.expr.visitExpression(this, context),
    );
  }

  visitFunctionExpr(ast: o.FunctionExpr, context: any) {
    return ts.factory.createArrowFunction(
      undefined,
      undefined,
      ast.params.map((p) =>
        ts.factory.createParameterDeclaration(undefined, undefined, p.name),
      ),
      undefined,
      ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken),
      ts.factory.createBlock(
        ast.statements.map((s) => s.visitStatement(this, context)),
        true,
      ),
    );
  }

  visitArrowFunctionExpr(ast: o.ArrowFunctionExpr, context: any) {
    const params = ast.params.map((p) =>
      ts.factory.createParameterDeclaration(undefined, undefined, p.name),
    );
    const arrow = ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken);
    // ArrowFunctionExpr body can be a single Expression or an array of Statements
    const body = Array.isArray(ast.body)
      ? ts.factory.createBlock(
          ast.body.map((s) => s.visitStatement(this, context)),
          true,
        )
      : ast.body.visitExpression(this, context);
    return ts.factory.createArrowFunction(
      undefined,
      undefined,
      params,
      undefined,
      arrow,
      body,
    );
  }

  visitDynamicImportExpr(ast: o.DynamicImportExpr, context: any) {
    const urlArg =
      typeof ast.url === 'string'
        ? ts.factory.createStringLiteral(ast.url)
        : ast.url.visitExpression(this, context);
    return ts.factory.createCallExpression(
      ts.factory.createToken(ts.SyntaxKind.ImportKeyword) as any,
      undefined,
      [urlArg],
    );
  }

  visitParenthesizedExpr(ast: o.ParenthesizedExpr, context: any) {
    return ts.factory.createParenthesizedExpression(
      ast.expr.visitExpression(this, context),
    );
  }

  visitCommaExpr(ast: o.CommaExpr, context: any) {
    return ast.parts
      .map((p) => p.visitExpression(this, context))
      .reduce((p, c) =>
        ts.factory.createBinaryExpression(p, ts.SyntaxKind.CommaToken, c),
      );
  }

  visitVoidExpr(ast: o.VoidExpr, context: any) {
    return ts.factory.createVoidExpression(
      ast.expr.visitExpression(this, context),
    );
  }

  visitLocalizedString(ast: o.LocalizedString, context: any) {
    throw new Error('i18n is not supported');
  }

  visitRegularExpressionLiteral(
    ast: o.RegularExpressionLiteralExpr,
    context: any,
  ) {
    return ts.factory.createRegularExpressionLiteral(
      `/${(ast as any).body ?? (ast as any).pattern}/${ast.flags}`,
    );
  }

  visitTemplateLiteralElementExpr(
    ast: o.TemplateLiteralElementExpr,
    context: any,
  ) {
    return ts.factory.createStringLiteral(ast.text);
  }

  visitWrappedNodeExpr(ast: o.WrappedNodeExpr<any>, context: any) {
    // This is how Angular passes back original TS nodes (like Signal calls)
    // into the generated code.
    return ast.node as ts.Expression;
  }

  visitExternalExpr(ast: o.ExternalExpr, context: any) {
    const moduleName = ast.value.moduleName;
    const name = ast.value.name!;
    if (moduleName && moduleName !== '@angular/core') {
      throw new Error(
        `Unsupported external module reference: ${moduleName}.${name}`,
      );
    }
    // ngDevMode is a global variable, not an @angular/core export
    if (name === 'ngDevMode') {
      return ts.factory.createIdentifier(name);
    }
    return ts.factory.createPropertyAccessExpression(
      ts.factory.createIdentifier('i0'),
      ts.factory.createIdentifier(name),
    );
  }

  // --- Statement Visitor Methods ---

  visitDeclareVarStmt(stmt: o.DeclareVarStmt, context: any) {
    return ts.factory.createVariableStatement(
      undefined,
      ts.factory.createVariableDeclarationList(
        [
          ts.factory.createVariableDeclaration(
            stmt.name,
            undefined,
            undefined,
            stmt.value ? stmt.value.visitExpression(this, context) : undefined,
          ),
        ],
        stmt.hasModifier(o.StmtModifier.Final)
          ? ts.NodeFlags.Const
          : ts.NodeFlags.Let,
      ),
    );
  }

  visitDeclareFunctionStmt(stmt: o.DeclareFunctionStmt, context: any) {
    return ts.factory.createFunctionDeclaration(
      undefined,
      undefined,
      stmt.name,
      undefined,
      stmt.params.map((p) =>
        ts.factory.createParameterDeclaration(undefined, undefined, p.name),
      ),
      undefined,
      ts.factory.createBlock(
        stmt.statements.map((s) => s.visitStatement(this, context)),
        true,
      ),
    );
  }

  visitExpressionStmt(stmt: o.ExpressionStatement, context: any) {
    return ts.factory.createExpressionStatement(
      stmt.expr.visitExpression(this, context),
    );
  }

  visitReturnStmt(stmt: o.ReturnStatement, context: any) {
    return ts.factory.createReturnStatement(
      stmt.value.visitExpression(this, context),
    );
  }

  visitIfStmt(stmt: o.IfStmt, context: any) {
    return ts.factory.createIfStatement(
      stmt.condition.visitExpression(this, context),
      ts.factory.createBlock(
        stmt.trueCase.map((s) => s.visitStatement(this, context)),
        true,
      ),
      stmt.falseCase.length
        ? ts.factory.createBlock(
            stmt.falseCase.map((s) => s.visitStatement(this, context)),
            true,
          )
        : undefined,
    );
  }
}
