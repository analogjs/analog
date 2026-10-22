import type { StandardSchemaV1 } from '@standard-schema/spec';

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
