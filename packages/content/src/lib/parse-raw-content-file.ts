import type { StandardSchemaV1 } from '@standard-schema/spec';
import fm from 'front-matter';

import { FrontmatterValidationError } from './frontmatter-validation-error';

export { FrontmatterValidationError };

export function parseRawContentFile<
  Attributes extends Record<string, any> = Record<string, any>,
>(rawContentFile: string): { content: string; attributes: Attributes };

export function parseRawContentFile<TSchema extends StandardSchemaV1>(
  rawContentFile: string,
  schema: TSchema,
  filename?: string,
): { content: string; attributes: StandardSchemaV1.InferOutput<TSchema> };

export function parseRawContentFile(
  rawContentFile: string,
  schema?: StandardSchemaV1,
  filename?: string,
): { content: string; attributes: unknown } {
  const { body, attributes } = fm(rawContentFile);

  if (schema) {
    const result = schema['~standard'].validate(attributes);
    if (
      result != null &&
      typeof (result as PromiseLike<unknown>).then === 'function'
    ) {
      throw new Error(
        'parseRawContentFile does not support async schema validation. ' +
          'Use parseRawContentFileAsync() for async schemas.',
      );
    }
    const syncResult = result as StandardSchemaV1.Result<
      StandardSchemaV1.InferOutput<typeof schema>
    >;
    if (syncResult.issues) {
      throw new FrontmatterValidationError(syncResult.issues, filename);
    }
    return { content: body, attributes: syncResult.value };
  }

  return { content: body, attributes };
}

export async function parseRawContentFileAsync<
  TSchema extends StandardSchemaV1,
>(
  rawContentFile: string,
  schema: TSchema,
  filename?: string,
): Promise<{
  content: string;
  attributes: StandardSchemaV1.InferOutput<TSchema>;
}> {
  const { body, attributes } = fm(rawContentFile);
  const result = await schema['~standard'].validate(attributes);
  if (result.issues) {
    throw new FrontmatterValidationError(result.issues, filename);
  }
  return { content: body, attributes: result.value };
}
