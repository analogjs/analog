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
const HAS_OPTIONAL_CHAINING_OUTPUT =
  'isOptional' in new o.ReadPropExpr(new o.ReadVarExpr('x'), 'y');

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

  // Receivers of `.name`, `.name(...)`, and `[index]` need parens when
  // they're a binary expression (precedence) or a non-negative integer
  // literal (the dot would otherwise be parsed as a decimal-point start
  // — `3600.toFixed(2)` is "Invalid characters after number"). Found in
  // a real Angular template binding `((x ?? 0) / 3600).toFixed(2)` whose
  // inner `BinaryOperatorExpr` receiver was emitted without parens, so
  // the resulting `(x ?? 0) / 3600.toFixed(2)` failed Vite's oxc parse.
  describe('member-access receiver parenthesization', () => {
    it('wraps a binary-expression receiver of `.name`', () => {
      const expr = new o.ReadPropExpr(
        bin(o.BinaryOperator.Divide, v('a'), lit(3600)),
        'toFixed',
      );
      expect(emitAngularExpr(expr)).toBe('(a / 3600).toFixed');
    });

    it('wraps a binary-expression receiver when the prop access is invoked', () => {
      // Method calls in v21 are emitted as InvokeFunctionExpr around a
      // ReadPropExpr — there is no separate InvokeMethodExpr. The fix
      // lives on ReadPropExpr's receiver and must survive the wrapping.
      const expr = new o.InvokeFunctionExpr(
        new o.ReadPropExpr(
          bin(o.BinaryOperator.Divide, v('a'), lit(3600)),
          'toFixed',
        ),
        [lit(2)],
      );
      expect(emitAngularExpr(expr)).toBe('(a / 3600).toFixed(2)');
    });

    it('wraps a non-negative integer-literal receiver of `.name`', () => {
      const expr = new o.ReadPropExpr(lit(42), 'toString');
      expect(emitAngularExpr(expr)).toBe('(42).toString');
    });

    it('does not wrap a string-literal receiver', () => {
      const expr = new o.ReadPropExpr(lit('hi'), 'length');
      expect(emitAngularExpr(expr)).toBe('"hi".length');
    });

    it('does not wrap a variable receiver', () => {
      const expr = new o.ReadPropExpr(v('foo'), 'bar');
      expect(emitAngularExpr(expr)).toBe('foo.bar');
    });

    it('wraps a binary-expression receiver of `[index]`', () => {
      const expr = new o.ReadKeyExpr(
        bin(o.BinaryOperator.Plus, v('a'), v('b')),
        lit(0),
      );
      expect(emitAngularExpr(expr)).toBe('(a + b)[0]');
    });
  });
});

describe('JSEmitter – optional chaining', () => {
  const ctxProp = (name: string) => new o.ReadPropExpr(v('ctx'), name);
  const optionalProp = (receiver: o.Expression, name: string) =>
    new o.ReadPropExpr(receiver, name, null, null, undefined, true);
  const optionalKey = (receiver: o.Expression, index: o.Expression) =>
    new o.ReadKeyExpr(receiver, index, null, null, undefined, true);
  const optionalCall = (fn: o.Expression, ...args: o.Expression[]) =>
    new o.InvokeFunctionExpr(fn, args, null, null, false, undefined, true);
  const evaluate = (expr: o.Expression, ctx: Record<string, unknown>) =>
    new Function('ctx', 'return ' + emitAngularExpr(expr))(ctx);

  describe.skipIf(!HAS_OPTIONAL_CHAINING_OUTPUT)(
    'optional member access',
    () => {
      it('emits an optional property read: a?.b', () => {
        expect(emitAngularExpr(optionalProp(v('a'), 'b'))).toBe('a?.b');
      });

      it('emits an optional keyed read: a?.[0]', () => {
        expect(emitAngularExpr(optionalKey(v('a'), lit(0)))).toBe('a?.[0]');
      });

      it('emits an optional call: a?.(1)', () => {
        expect(emitAngularExpr(optionalCall(v('a'), lit(1)))).toBe('a?.(1)');
      });

      it('keeps an optional call on a function expression: (() => {})?.()', () => {
        const fn = new o.FunctionExpr([], []);
        expect(emitAngularExpr(optionalCall(fn))).toBe('(() => {})?.()');
      });

      it('emits a mixed chain: a?.b?.[0]?.()', () => {
        const expr = optionalCall(
          optionalKey(optionalProp(v('a'), 'b'), lit(0)),
        );
        expect(emitAngularExpr(expr)).toBe('a?.b?.[0]?.()');
      });

      it('keeps non-optional access unchanged: a.b, a[0], a(1)', () => {
        expect(emitAngularExpr(new o.ReadPropExpr(v('a'), 'b'))).toBe('a.b');
        expect(emitAngularExpr(new o.ReadKeyExpr(v('a'), lit(0)))).toBe('a[0]');
        expect(
          emitAngularExpr(new o.InvokeFunctionExpr(v('a'), [lit(1)])),
        ).toBe('a(1)');
      });

      it('short-circuits the rest of the chain: ctx.nul?.b.c', () => {
        const expr = new o.ReadPropExpr(optionalProp(ctxProp('nul'), 'b'), 'c');
        expect(emitAngularExpr(expr)).toBe('ctx.nul?.b.c');
        expect(evaluate(expr, { nul: null })).toBeUndefined();
      });

      it('returns undefined instead of throwing for a nullish receiver', () => {
        const ctx = { nul: null, obj: {} };
        expect(
          evaluate(optionalProp(ctxProp('nul'), 'a'), ctx),
        ).toBeUndefined();
        expect(
          evaluate(optionalKey(ctxProp('nul'), lit(0)), ctx),
        ).toBeUndefined();
        expect(evaluate(optionalCall(ctxProp('nul')), ctx)).toBeUndefined();
        expect(
          evaluate(optionalCall(optionalProp(ctxProp('obj'), 'fn')), ctx),
        ).toBeUndefined();
      });

      it('reads through a non-nullish receiver', () => {
        const ctx = { obj: { a: { b: 2 }, list: [7], fn: () => 9 } };
        expect(
          evaluate(optionalProp(optionalProp(ctxProp('obj'), 'a'), 'b'), ctx),
        ).toBe(2);
        expect(
          evaluate(
            optionalKey(optionalProp(ctxProp('obj'), 'list'), lit(0)),
            ctx,
          ),
        ).toBe(7);
        expect(
          evaluate(optionalCall(optionalProp(ctxProp('obj'), 'fn')), ctx),
        ).toBe(9);
      });

      it('ends the chain at explicit parentheses: (a?.b).c', () => {
        const expr = new o.ReadPropExpr(
          new o.ParenthesizedExpr(optionalProp(ctxProp('nul'), 'b')),
          'c',
        );
        expect(emitAngularExpr(expr)).toBe('(ctx.nul?.b).c');
        expect(() => evaluate(expr, { nul: null })).toThrow(TypeError);
      });
    },
  );
});
