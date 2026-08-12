import type { StandardSchemaV1 } from '@analogjs/router';

// Minimal Standard-Schema validators so the prototype needs no extra dependency.
// The real design uses valibot; any Standard-Schema library drops in unchanged.

type Infer<S> = S extends StandardSchemaV1<infer T> ? T : never;

export function string(): StandardSchemaV1<string> {
  return {
    '~standard': {
      version: 1,
      vendor: 'analog-proto',
      validate: (value) =>
        typeof value === 'string'
          ? { value }
          : { issues: [{ message: 'expected string' }] },
    },
  };
}

export function object<S extends Record<string, StandardSchemaV1<unknown>>>(
  shape: S,
): StandardSchemaV1<{ [K in keyof S]: Infer<S[K]> }> {
  return {
    '~standard': {
      version: 1,
      vendor: 'analog-proto',
      validate: (value) => {
        if (typeof value !== 'object' || value === null) {
          return { issues: [{ message: 'expected object' }] };
        }
        const out: Record<string, unknown> = {};
        const issues: { message: string }[] = [];
        for (const key of Object.keys(shape)) {
          const result = shape[key]['~standard'].validate(
            (value as Record<string, unknown>)[key],
          ) as { value?: unknown; issues?: ReadonlyArray<{ message: string }> };
          if (result.issues) {
            issues.push(
              ...result.issues.map((i) => ({
                message: `${key}: ${i.message}`,
              })),
            );
          } else {
            out[key] = result.value;
          }
        }
        return issues.length
          ? { issues }
          : { value: out as { [K in keyof S]: Infer<S[K]> } };
      },
    },
  };
}
