import type { StandardSchemaV1 } from '@standard-schema/spec';

/**
 * Validates unknown input against a Standard Schema.
 *
 * Handles both sync and async `validate` implementations — the Standard
 * Schema spec allows either return shape.
 */
export async function validateWithSchema<T extends StandardSchemaV1>(
  schema: T,
  data: unknown,
): Promise<StandardSchemaV1.Result<StandardSchemaV1.InferOutput<T>>> {
  return schema['~standard'].validate(data);
}
