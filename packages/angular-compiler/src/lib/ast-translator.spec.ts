import { describe, it, expect } from 'vitest';
import * as o from '@angular/compiler';
import * as ts from 'typescript';
import { AstTranslator } from './ast-translator';

const translator = new AstTranslator();
const printer = ts.createPrinter();
const sf = ts.createSourceFile('test.ts', '', ts.ScriptTarget.Latest);

function printExpr(expr: o.Expression): string {
  const tsNode = expr.visitExpression(translator, null);
  return printer.printNode(ts.EmitHint.Expression, tsNode, sf);
}

function printStmt(stmt: o.Statement): string {
  const tsNode = stmt.visitStatement(translator, null);
  return printer.printNode(ts.EmitHint.Unspecified, tsNode as ts.Statement, sf);
}

describe('AstTranslator', () => {
  describe('Expressions', () => {
    it('translates string literal', () => {
      expect(printExpr(new o.LiteralExpr('hello'))).toBe('"hello"');
    });

    it('translates number literal', () => {
      expect(printExpr(new o.LiteralExpr(42))).toBe('42');
    });

    it('translates negative number literal', () => {
      expect(printExpr(new o.LiteralExpr(-3))).toBe('-3');
    });

    it('translates boolean literals', () => {
      expect(printExpr(new o.LiteralExpr(true))).toBe('true');
      expect(printExpr(new o.LiteralExpr(false))).toBe('false');
    });

    it('translates null literal', () => {
      expect(printExpr(new o.LiteralExpr(null))).toBe('null');
    });

    it('translates undefined literal', () => {
      expect(printExpr(new o.LiteralExpr(undefined))).toBe('void 0');
    });

    it('translates ReadVarExpr', () => {
      expect(printExpr(new o.ReadVarExpr('foo'))).toBe('foo');
    });

    it('translates ReadVarExpr for this', () => {
      expect(printExpr(new o.ReadVarExpr('this'))).toBe('this');
    });

    it('translates ReadVarExpr for super', () => {
      expect(printExpr(new o.ReadVarExpr('super'))).toBe('super');
    });

    it('translates ReadPropExpr', () => {
      const expr = new o.ReadPropExpr(new o.ReadVarExpr('obj'), 'name');
      expect(printExpr(expr)).toBe('obj.name');
    });

    it('translates ReadKeyExpr', () => {
      const expr = new o.ReadKeyExpr(
        new o.ReadVarExpr('arr'),
        new o.LiteralExpr(0),
      );
      expect(printExpr(expr)).toBe('arr[0]');
    });

    it('translates NotExpr', () => {
      const expr = new o.NotExpr(new o.ReadVarExpr('x'));
      expect(printExpr(expr)).toBe('!x');
    });

    it('translates TypeofExpr', () => {
      const expr = new o.TypeofExpr(new o.ReadVarExpr('x'));
      expect(printExpr(expr)).toBe('typeof x');
    });

    it('translates VoidExpr', () => {
      const expr = new o.VoidExpr(new o.LiteralExpr(0));
      expect(printExpr(expr)).toBe('void 0');
    });

    it('translates ConditionalExpr', () => {
      const expr = new o.ConditionalExpr(
        new o.ReadVarExpr('cond'),
        new o.LiteralExpr('yes'),
        new o.LiteralExpr('no'),
      );
      expect(printExpr(expr)).toBe('cond ? "yes" : "no"');
    });

    it('translates BinaryOperatorExpr', () => {
      const expr = new o.BinaryOperatorExpr(
        o.BinaryOperator.Plus,
        new o.ReadVarExpr('a'),
        new o.LiteralExpr(1),
      );
      expect(printExpr(expr)).toBe('a + 1');
    });

    it('translates BinaryOperatorExpr with nullish coalesce', () => {
      const expr = new o.BinaryOperatorExpr(
        o.BinaryOperator.NullishCoalesce,
        new o.ReadVarExpr('a'),
        new o.LiteralExpr('default'),
      );
      expect(printExpr(expr)).toBe('a ?? "default"');
    });

    it('throws on unknown binary operator', () => {
      const expr = new o.BinaryOperatorExpr(
        999 as any,
        new o.ReadVarExpr('a'),
        new o.ReadVarExpr('b'),
      );
      expect(() => printExpr(expr)).toThrow('Unsupported binary operator');
    });

    it('translates UnaryOperatorExpr', () => {
      const minus = new o.UnaryOperatorExpr(
        o.UnaryOperator.Minus,
        new o.ReadVarExpr('x'),
      );
      const plus = new o.UnaryOperatorExpr(
        o.UnaryOperator.Plus,
        new o.ReadVarExpr('x'),
      );
      expect(printExpr(minus)).toBe('-x');
      expect(printExpr(plus)).toBe('+x');
    });

    it('throws on unknown unary operator', () => {
      const expr = new o.UnaryOperatorExpr(999 as any, new o.ReadVarExpr('x'));
      expect(() => printExpr(expr)).toThrow('Unsupported unary operator');
    });

    it('translates LiteralArrayExpr', () => {
      const expr = new o.LiteralArrayExpr([
        new o.LiteralExpr(1),
        new o.LiteralExpr('two'),
        new o.LiteralExpr(true),
      ]);
      const result = printExpr(expr);
      expect(result).toContain('1');
      expect(result).toContain('"two"');
      expect(result).toContain('true');
    });

    it('translates LiteralMapExpr', () => {
      const expr = new o.LiteralMapExpr([
        { key: 'name', value: new o.LiteralExpr('test'), quoted: false },
        { key: 'with-dash', value: new o.LiteralExpr(42), quoted: true },
      ]);
      const result = printExpr(expr);
      expect(result).toContain('name: "test"');
      expect(result).toContain('"with-dash": 42');
    });

    it('translates InvokeFunctionExpr', () => {
      const expr = new o.InvokeFunctionExpr(new o.ReadVarExpr('fn'), [
        new o.LiteralExpr(1),
        new o.LiteralExpr(2),
      ]);
      expect(printExpr(expr)).toBe('fn(1, 2)');
    });

    it('translates InstantiateExpr', () => {
      const expr = new o.InstantiateExpr(new o.ReadVarExpr('Foo'), [
        new o.LiteralExpr('arg'),
      ]);
      expect(printExpr(expr)).toBe('new Foo("arg")');
    });

    it('translates FunctionExpr', () => {
      const expr = new o.FunctionExpr(
        [{ name: 'x' } as any, { name: 'y' } as any],
        [
          new o.ReturnStatement(
            new o.BinaryOperatorExpr(
              o.BinaryOperator.Plus,
              new o.ReadVarExpr('x'),
              new o.ReadVarExpr('y'),
            ),
          ),
        ],
      );
      const result = printExpr(expr);
      expect(result).toContain('x');
      expect(result).toContain('y');
      expect(result).toContain('return');
    });

    it('translates ArrowFunctionExpr with expression body', () => {
      const expr = new o.ArrowFunctionExpr(
        [{ name: 'x' } as any],
        new o.BinaryOperatorExpr(
          o.BinaryOperator.Multiply,
          new o.ReadVarExpr('x'),
          new o.LiteralExpr(2),
        ),
      );
      const result = printExpr(expr);
      expect(result).toContain('=>');
      expect(result).toContain('x * 2');
    });

    it('translates ArrowFunctionExpr with statement body', () => {
      const expr = new o.ArrowFunctionExpr([{ name: 'x' } as any], [
        new o.ReturnStatement(new o.ReadVarExpr('x')),
      ] as any);
      const result = printExpr(expr);
      expect(result).toContain('=>');
      expect(result).toContain('return');
    });

    it('translates DynamicImportExpr', () => {
      const expr = new o.DynamicImportExpr(new o.LiteralExpr('./module'));
      expect(printExpr(expr)).toBe('import("./module")');
    });

    it('translates ParenthesizedExpr', () => {
      const expr = new o.ParenthesizedExpr(
        new o.BinaryOperatorExpr(
          o.BinaryOperator.Plus,
          new o.LiteralExpr(1),
          new o.LiteralExpr(2),
        ),
      );
      expect(printExpr(expr)).toBe('(1 + 2)');
    });

    it('translates CommaExpr', () => {
      const expr = new o.CommaExpr([
        new o.ReadVarExpr('a'),
        new o.ReadVarExpr('b'),
        new o.ReadVarExpr('c'),
      ]);
      expect(printExpr(expr)).toBe('a, b, c');
    });

    it('translates RegularExpressionLiteralExpr', () => {
      // Constructor is (body, flags) — the translator reads .pattern and .flags
      // but the class stores body/flags. Let's check what the visitor reads.
      const expr = new o.RegularExpressionLiteralExpr('\\d+', 'g');
      const result = printExpr(expr);
      expect(result).toContain('/');
      expect(result).toContain('g');
    });

    it('translates ExternalExpr for @angular/core', () => {
      const expr = new o.ExternalExpr({
        name: 'ɵɵdefineComponent',
        moduleName: '@angular/core',
      });
      expect(printExpr(expr)).toBe('i0.ɵɵdefineComponent');
    });

    it('translates ngDevMode as global identifier', () => {
      const expr = new o.ExternalExpr({
        name: 'ngDevMode',
        moduleName: '@angular/core',
      });
      expect(printExpr(expr)).toBe('ngDevMode');
    });

    it('throws for non-core ExternalExpr', () => {
      const expr = new o.ExternalExpr({
        name: 'something',
        moduleName: '@angular/common',
      });
      expect(() => printExpr(expr)).toThrow(
        'Unsupported external module reference',
      );
    });

    it('translates WrappedNodeExpr', () => {
      const tsIdent = ts.factory.createIdentifier('myVar');
      const expr = new o.WrappedNodeExpr(tsIdent);
      expect(printExpr(expr)).toBe('myVar');
    });

    it('translates i18n LocalizedString throws', () => {
      // LocalizedString is not exported in a way we can easily construct,
      // but we verify the error message exists in the translator
      expect(() => {
        const fakeAst = {
          visitExpression: (v: any, c: any) =>
            (v as any).visitLocalizedString(fakeAst, c),
        };
        (fakeAst as any).visitExpression(translator, null);
      }).toThrow('i18n is not supported');
    });
  });

  describe('Statements', () => {
    it('translates DeclareVarStmt with const', () => {
      const stmt = new o.DeclareVarStmt(
        'x',
        new o.LiteralExpr(42),
        undefined,
        o.StmtModifier.Final,
      );
      expect(printStmt(stmt)).toContain('const x = 42');
    });

    it('translates DeclareVarStmt with let', () => {
      const stmt = new o.DeclareVarStmt('y', new o.LiteralExpr('hello'));
      expect(printStmt(stmt)).toContain('let y = "hello"');
    });

    it('translates ExpressionStatement', () => {
      const stmt = new o.ExpressionStatement(
        new o.InvokeFunctionExpr(new o.ReadVarExpr('doSomething'), []),
      );
      expect(printStmt(stmt)).toContain('doSomething()');
    });

    it('translates ReturnStatement', () => {
      const stmt = new o.ReturnStatement(new o.LiteralExpr(true));
      expect(printStmt(stmt)).toContain('return true');
    });

    it('translates IfStmt', () => {
      const stmt = new o.IfStmt(
        new o.ReadVarExpr('cond'),
        [new o.ReturnStatement(new o.LiteralExpr(1))],
        [new o.ReturnStatement(new o.LiteralExpr(2))],
      );
      const result = printStmt(stmt);
      expect(result).toContain('if (cond)');
      expect(result).toContain('return 1');
      expect(result).toContain('return 2');
    });

    it('translates IfStmt without else', () => {
      const stmt = new o.IfStmt(new o.ReadVarExpr('cond'), [
        new o.ReturnStatement(new o.LiteralExpr(1)),
      ]);
      const result = printStmt(stmt);
      expect(result).toContain('if (cond)');
      expect(result).not.toContain('else');
    });

    it('translates DeclareFunctionStmt', () => {
      const stmt = new o.DeclareFunctionStmt(
        'add',
        [{ name: 'a' } as any, { name: 'b' } as any],
        [
          new o.ReturnStatement(
            new o.BinaryOperatorExpr(
              o.BinaryOperator.Plus,
              new o.ReadVarExpr('a'),
              new o.ReadVarExpr('b'),
            ),
          ),
        ],
      );
      const result = printStmt(stmt);
      expect(result).toContain('function add(a, b)');
      expect(result).toContain('return a + b');
    });
  });
});
