import type { Logger } from 'vite';

export function warnStylesheetError(
  logger: Logger | undefined,
  filename: string,
  error: unknown,
): void {
  logger?.warn(
    `[@analogjs/vite-plugin-angular] Failed to process stylesheet ${filename}; ` +
      `it was left unprocessed. ${error instanceof Error ? error.message : String(error)}`,
    { timestamp: true },
  );
}
