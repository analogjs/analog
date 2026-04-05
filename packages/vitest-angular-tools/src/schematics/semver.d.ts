declare module 'semver' {
  export function coerce(
    version: string | null | undefined,
  ): { version: string } | null;
  export function major(version: string | { version: string }): number;
  export function lt(v1: string, v2: string): boolean;
}
