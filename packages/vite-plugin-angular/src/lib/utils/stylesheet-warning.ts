import type { Logger } from 'vite';

export function reportStylesheetError(
  logger: Logger | undefined,
  filename: string,
  error: unknown,
  isBuild: boolean,
): void {
  const message = `[@analogjs/vite-plugin-angular] Failed to process stylesheet ${filename}`;
  const detail = error instanceof Error ? error.message : String(error);
  if (isBuild) {
    throw new Error(`${message}. ${detail}`, { cause: error });
  }
  logger?.warn(`${message}; it was left unprocessed. ${detail}`, {
    timestamp: true,
  });
}
