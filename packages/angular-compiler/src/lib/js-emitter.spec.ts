import { describe, it, expect } from 'vitest';
import * as o from '@angular/compiler';
import { emitAngularExpr } from './js-emitter';

// Version-aware test gates. Angular's `BinaryOperator` enum is missing
// 11–13 members on v19/v20 (Assign, all 9 compound assignments, Exponen-
// tiation/In on v19, InstanceOf on v19/v20). Tests that explicitly
// construct expressions with those operators are nonsensical on versions
// where the enum members don't exist — `o.BinaryOperator.Assign` would
// evaluate to `undefined` and the test would assert against an
// expression with `operator: undefined`. Skip such tests on versions
// where the operator is missing rather than leaving them broken.
const HAS_EXPONENTIATION =
  typeof (o.BinaryOperator as Record<string, unknown>)['Exponentiation'] ===
  'number';
const HAS_ASSIGN_OPS =
  typeof (o.BinaryOperator as Record<string, unknown>)['Assign'] === 'number';

function bin(op: o.BinaryOperator, lhs: o.Expression, rhs: o.Expression) {
  return new o.BinaryOperatorExpr(op, lhs, rhs);
}
const v = (name: string) => new o.ReadVarExpr(name);
const lit = (val: number | string | boolean | null | undefined) =>
  new o.LiteralExpr(val);

describe('JSEmitter – operator precedence', () => {
  describe('lower-precedence children get parenthesized', () => {
    it('parenthesizes lower-precedence LHS: (a + b) * c', () => {
      const expr = bin(
        o.BinaryOperator.Multiply,
        bin(o.BinaryOperator.Plus, v('a'), v('b')),
        v('c'),
      );
      expect(emitAngularExpr(expr)).toBe('(a + b) * c');
    });

    it('parenthesizes lower-precedence RHS: a * (b + c)', () => {
      const expr = bin(
        o.BinaryOperator.Multiply,
        v('a'),
        bin(o.BinaryOperator.Plus, v('b'), v('c')),
      );
      expect(emitAngularExpr(expr)).toBe('a * (b + c)');
    });

    it('does not parenthesize higher-precedence child: a + b * c', () => {
      const expr = bin(
        o.BinaryOperator.Plus,
        v('a'),
        bin(o.BinaryOperator.Multiply, v('b'), v('c')),
      );
      expect(emitAngularExpr(expr)).toBe('a + b * c');
    });

    it('parenthesizes bitwise OR inside bitwise AND: (a | b) & c', () => {
      const expr = bin(
        o.BinaryOperator.BitwiseAnd,
        bin(o.BinaryOperator.BitwiseOr, v('a'), v('b')),
        v('c'),
      );
      expect(emitAngularExpr(expr)).toBe('(a | b) & c');
    });
  });

  describe('nullish coalescing cannot mix with || or &&', () => {
    it('parenthesizes ?? inside ||', () => {
      const expr = bin(
        o.BinaryOperator.Or,
        bin(o.BinaryOperator.NullishCoalesce, v('a'), v('b')),
        v('c'),
      );
      expect(emitAngularExpr(expr)).toBe('(a ?? b) || c');
    });

    it('parenthesizes ?? as RHS of ||', () => {
      const expr = bin(
        o.BinaryOperator.Or,
        v('a'),
        bin(o.BinaryOperator.NullishCoalesce, v('b'), v('c')),
      );
      expect(emitAngularExpr(expr)).toBe('a || (b ?? c)');
    });

    it('parenthesizes || inside ??', () => {
      const expr = bin(
        o.BinaryOperator.NullishCoalesce,
        bin(o.BinaryOperator.Or, v('a'), v('b')),
        v('c'),
      );
      expect(emitAngularExpr(expr)).toBe('(a || b) ?? c');
    });

    it('parenthesizes && inside ??', () => {
      const expr = bin(
        o.BinaryOperator.NullishCoalesce,
        bin(o.BinaryOperator.And, v('a'), v('b')),
        v('c'),
      );
      expect(emitAngularExpr(expr)).toBe('(a && b) ?? c');
    });

    it('parenthesizes && as RHS of ??', () => {
      const expr = bin(
        o.BinaryOperator.NullishCoalesce,
        v('a'),
        bin(o.BinaryOperator.And, v('b'), v('c')),
      );
      expect(emitAngularExpr(expr)).toBe('a ?? (b && c)');
    });
  });

  describe('same-precedence, left-associative operators', () => {
    it('parenthesizes same-precedence RHS: a - (b - c)', () => {
      const expr = bin(
        o.BinaryOperator.Minus,
        v('a'),
        bin(o.BinaryOperator.Minus, v('b'), v('c')),
      );
      expect(emitAngularExpr(expr)).toBe('a - (b - c)');
    });

    it('does not parenthesize same-precedence LHS: a - b - c', () => {
      const expr = bin(
        o.BinaryOperator.Minus,
        bin(o.BinaryOperator.Minus, v('a'), v('b')),
        v('c'),
      );
      expect(emitAngularExpr(expr)).toBe('a - b - c');
    });

    it('parenthesizes same-precedence-group RHS: a / (b * c)', () => {
      const expr = bin(
        o.BinaryOperator.Divide,
        v('a'),
        bin(o.BinaryOperator.Multiply, v('b'), v('c')),
      );
      expect(emitAngularExpr(expr)).toBe('a / (b * c)');
    });
  });

  // `Exponentiation` was added to `BinaryOperator` in Angular 20 — these
  // tests are nonsensical on v19 where the enum member doesn't exist.
  describe.skipIf(!HAS_EXPONENTIATION)(
    'right-associative exponentiation',
    () => {
      it('parenthesizes LHS of **: (a ** b) ** c', () => {
        const expr = bin(
          o.BinaryOperator.Exponentiation,
          bin(o.BinaryOperator.Exponentiation, v('a'), v('b')),
          v('c'),
        );
        expect(emitAngularExpr(expr)).toBe('(a ** b) ** c');
      });

      it('does not parenthesize RHS of **: a ** b ** c', () => {
        const expr = bin(
          o.BinaryOperator.Exponentiation,
          v('a'),
          bin(o.BinaryOperator.Exponentiation, v('b'), v('c')),
        );
        expect(emitAngularExpr(expr)).toBe('a ** b ** c');
      });
    },
  );

  describe('original bug scenario', () => {
    it('preserves parens: (a ?? 0) + (b || c) + 15', () => {
      const expr = bin(
        o.BinaryOperator.Plus,
        bin(
          o.BinaryOperator.Plus,
          bin(o.BinaryOperator.NullishCoalesce, v('a'), lit(0)),
          bin(o.BinaryOperator.Or, v('b'), v('c')),
        ),
        lit(15),
      );
      expect(emitAngularExpr(expr)).toBe('(a ?? 0) + (b || c) + 15');
    });
  });

  // `Assign` and the 9 compound assignment operators were added to
  // `BinaryOperator` in Angular 21 — these tests cannot run on v19/v20.
  describe.skipIf(!HAS_ASSIGN_OPS)('assignments remain wrapped', () => {
    it('wraps simple assignment in parens', () => {
      const expr = bin(o.BinaryOperator.Assign, v('x'), lit(1));
      expect(emitAngularExpr(expr)).toBe('(x = 1)');
    });

    it('wraps addition-assignment in parens', () => {
      const expr = bin(o.BinaryOperator.AdditionAssignment, v('x'), lit(1));
      expect(emitAngularExpr(expr)).toBe('(x += 1)');
    });

    it('wraps nullish-coalesce-assignment in parens', () => {
      const expr = bin(
        o.BinaryOperator.NullishCoalesceAssignment,
        v('x'),
        lit(1),
      );
      expect(emitAngularExpr(expr)).toBe('(x ??= 1)');
    });
  });
});
