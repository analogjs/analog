import type { HmrBreadcrumb } from './hmr-diagnostics';

export type TailwindDebugSource = 'browser' | 'vite:hmr' | 'vite:ws' | 'system';

export interface TailwindDebugEventEntry {
  id: string;
  timestamp: string;
  source: TailwindDebugSource;
  summary: string;
  payload: unknown;
  clientId?: string;
}

export interface TailwindDebugSocketMessage {
  entry?: TailwindDebugEventEntry;
  entries?: TailwindDebugEventEntry[];
  type: 'entry' | 'snapshot' | 'system';
}

export function createEntryId(
  source: TailwindDebugSource,
  timestamp: string,
  salt: string,
): string {
  return `${source}:${timestamp}:${salt}`;
}

export function summarizeBrowserBreadcrumb(breadcrumb: HmrBreadcrumb): string {
  return breadcrumb.phase;
}

export function summarizePayload(
  source: Exclude<TailwindDebugSource, 'browser'>,
  payload: unknown,
): string {
  if (source === 'vite:hmr') {
    const candidate = payload as {
      file?: string;
      modules?: Array<{ url?: string }>;
    };
    const moduleCount = candidate.modules?.length ?? 0;
    return candidate.file
      ? `hot update ${candidate.file} (${moduleCount} modules)`
      : `hot update (${moduleCount} modules)`;
  }

  if (source === 'vite:ws') {
    const candidate = payload as {
      type?: string;
      updates?: Array<{ type?: string }>;
    };
    const updateCount = candidate.updates?.length ?? 0;
    return candidate.type
      ? `ws ${candidate.type}${updateCount ? ` (${updateCount} updates)` : ''}`
      : 'ws event';
  }

  const candidate = payload as { message?: string };
  return candidate.message ?? 'system event';
}

export function toBrowserEntry(
  breadcrumb: HmrBreadcrumb,
  clientId: string,
): TailwindDebugEventEntry {
  const timestamp = new Date(
    Date.now() - performance.now() + breadcrumb.now,
  ).toISOString();

  return {
    clientId,
    id: createEntryId('browser', timestamp, breadcrumb.phase),
    payload: breadcrumb,
    source: 'browser',
    summary: summarizeBrowserBreadcrumb(breadcrumb),
    timestamp,
  };
}
