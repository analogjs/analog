import type { StandardSchemaV1 } from '@standard-schema/spec';
import fm from 'front-matter';

export class FrontmatterValidationError extends Error {
  constructor(
    public readonly issues: ReadonlyArray<StandardSchemaV1.Issue>,
    public readonly filename?: string,
  ) {
    const issueMessages = issues
      .map((i) => {
        const path = i.path
          ? ` at "${i.path.map((p) => (typeof p === 'object' ? p.key : p)).join('.')}"`
          : '';
        return `  - ${i.message}${path}`;
      })
      .join('\n');
    const prefix = filename ? `"${filename}" f` : 'F';
    super(`${prefix}rontmatter validation failed:\n${issueMessages}`);
    this.name = 'FrontmatterValidationError';
  }
}

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
