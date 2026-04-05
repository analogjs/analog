import { describe, it, expect } from 'vitest';
import type { StandardSchemaV1 } from '@standard-schema/spec';
import { validateWithSchema } from './validate';

function createMockSchema<T>(
  validator: (value: unknown) => StandardSchemaV1.Result<T>,
): StandardSchemaV1<unknown, T> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      validate: validator,
    },
  };
}

describe('validateWithSchema', () => {
  it('should return value on successful sync validation', async () => {
    const schema = createMockSchema<{ email: string }>((value) => ({
      value: value as { email: string },
    }));

    const result = await validateWithSchema(schema, {
      email: 'test@test.com',
    });
    expect(result.issues).toBeUndefined();
    expect(
      (result as StandardSchemaV1.SuccessResult<{ email: string }>).value,
    ).toEqual({ email: 'test@test.com' });
  });

  it('should return issues on failed sync validation', async () => {
    const schema = createMockSchema<{ email: string }>(() => ({
      issues: [{ message: 'Invalid email', path: ['email'] }],
    }));

    const result = await validateWithSchema(schema, { email: 'bad' });
    expect(result.issues).toBeDefined();
    expect(result.issues).toHaveLength(1);
    expect(result.issues![0].message).toBe('Invalid email');
  });

  it('should handle async validation', async () => {
    const schema: StandardSchemaV1<unknown, { name: string }> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: async (value) => ({
          value: value as { name: string },
        }),
      },
    };

    const result = await validateWithSchema(schema, { name: 'Test' });
    expect(result.issues).toBeUndefined();
    expect(
      (result as StandardSchemaV1.SuccessResult<{ name: string }>).value,
    ).toEqual({ name: 'Test' });
  });

  it('should handle async validation failure', async () => {
    const schema: StandardSchemaV1<unknown, string> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: async () => ({
          issues: [{ message: 'Required' }],
        }),
      },
    };

    const result = await validateWithSchema(schema, undefined);
    expect(result.issues).toBeDefined();
    expect(result.issues![0].message).toBe('Required');
  });

  it('should preserve path segments in issues', async () => {
    const schema = createMockSchema(() => ({
      issues: [
        {
          message: 'Too short',
          path: ['user', { key: 'name' }],
        },
      ],
    }));

    const result = await validateWithSchema(schema, {});
    expect(result.issues![0].path).toEqual(['user', { key: 'name' }]);
  });

  it('should handle multiple issues', async () => {
    const schema = createMockSchema(() => ({
      issues: [
        { message: 'Name required', path: ['name'] },
        { message: 'Email required', path: ['email'] },
        { message: 'Age must be positive', path: ['age'] },
      ],
    }));

    const result = await validateWithSchema(schema, {});
    expect(result.issues).toHaveLength(3);
  });

  it('should handle issues without path', async () => {
    const schema = createMockSchema(() => ({
      issues: [{ message: 'Invalid input' }],
    }));

    const result = await validateWithSchema(schema, null);
    expect(result.issues![0].path).toBeUndefined();
    expect(result.issues![0].message).toBe('Invalid input');
  });

  it('should pass undefined input through to schema', async () => {
    let receivedValue: unknown;
    const schema = createMockSchema<unknown>((value) => {
      receivedValue = value;
      return { value };
    });

    await validateWithSchema(schema, undefined);
    expect(receivedValue).toBeUndefined();
  });

  it('should pass null input through to schema', async () => {
    let receivedValue: unknown = 'sentinel';
    const schema = createMockSchema<unknown>((value) => {
      receivedValue = value;
      return { value };
    });

    await validateWithSchema(schema, null);
    expect(receivedValue).toBeNull();
  });

  it('should handle schema that transforms values', async () => {
    const schema = createMockSchema<{ id: number }>((value) => {
      const v = value as { id: string };
      return { value: { id: parseInt(v.id, 10) } };
    });

    const result = await validateWithSchema(schema, { id: '42' });
    expect(
      (result as StandardSchemaV1.SuccessResult<{ id: number }>).value,
    ).toEqual({ id: 42 });
  });
});
