import type { StandardSchemaV1 } from '@standard-schema/spec';

export type ValidationFieldErrors = Record<string, string[]>;

function getPathSegmentKey(
  segment: string | number | symbol | { key: string | number | symbol },
) {
  return typeof segment === 'object' ? segment.key : segment;
}

export function issuePathToFieldName(
  path: ReadonlyArray<
    string | number | symbol | { key: string | number | symbol }
  >,
): string {
  return path.map((segment) => String(getPathSegmentKey(segment))).join('.');
}

export function issuesToFieldErrors(
  issues: ReadonlyArray<StandardSchemaV1.Issue>,
): ValidationFieldErrors {
  return issues.reduce<ValidationFieldErrors>((errors, issue) => {
    if (!issue.path?.length) {
      return errors;
    }

    const fieldName = issuePathToFieldName(issue.path);
    errors[fieldName] ??= [];
    errors[fieldName].push(issue.message);
    return errors;
  }, {});
}

export function issuesToFormErrors(
  issues: ReadonlyArray<StandardSchemaV1.Issue>,
): string[] {
  return issues
    .filter((issue) => !issue.path?.length)
    .map((issue) => issue.message);
}
