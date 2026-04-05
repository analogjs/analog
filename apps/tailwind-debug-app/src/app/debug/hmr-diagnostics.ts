export interface HmrBreadcrumb {
  details?: unknown;
  href: string;
  now: number;
  phase: string;
}

export interface TailwindDebugState {
  bootCount: number;
  breadcrumbs: HmrBreadcrumb[];
  previousSessionBreadcrumbs: HmrBreadcrumb[];
}

export const TAILWIND_DEBUG_BREADCRUMB_EVENT =
  'tailwind-debug:breadcrumb' as const;

const BREADCRUMB_LIMIT = 50;
const BREADCRUMB_KEY = 'tailwind-debug-app.hmr.breadcrumbs';
const BOOT_COUNT_KEY = 'tailwind-debug-app.hmr.boot-count';

export function appendBreadcrumb(
  history: readonly HmrBreadcrumb[],
  breadcrumb: HmrBreadcrumb,
  limit = BREADCRUMB_LIMIT,
): HmrBreadcrumb[] {
  return [...history, breadcrumb].slice(-limit);
}

export function classifyVitePayload(payload: unknown): string {
  if (!payload || typeof payload !== 'object') {
    return 'unknown';
  }

  const candidate = payload as {
    type?: string;
    updates?: Array<{ type?: string }>;
  };

  if (candidate.type === 'full-reload') {
    return 'full-reload';
  }

  if (
    candidate.type === 'update' &&
    candidate.updates?.some((update) => update.type === 'css-update')
  ) {
    return 'css-update';
  }

  return candidate.type ?? 'unknown';
}

export function readStoredBreadcrumbs(
  storage: Pick<Storage, 'getItem'>,
  key = BREADCRUMB_KEY,
): HmrBreadcrumb[] {
  const raw = storage.getItem(key);
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (entry): entry is HmrBreadcrumb =>
        !!entry &&
        typeof entry === 'object' &&
        typeof entry.phase === 'string' &&
        typeof entry.href === 'string' &&
        typeof entry.now === 'number',
    );
  } catch {
    return [];
  }
}

export function writeStoredBreadcrumbs(
  storage: Pick<Storage, 'setItem'>,
  breadcrumbs: readonly HmrBreadcrumb[],
  key = BREADCRUMB_KEY,
) {
  storage.setItem(key, JSON.stringify(breadcrumbs));
}

function readBootCount(storage: Pick<Storage, 'getItem'>): number {
  const raw = storage.getItem(BOOT_COUNT_KEY);
  const count = raw ? Number.parseInt(raw, 10) : 0;
  return Number.isFinite(count) ? count : 0;
}

function writeBootCount(storage: Pick<Storage, 'setItem'>, count: number) {
  storage.setItem(BOOT_COUNT_KEY, String(count));
}

export function setupBrowserDiagnostics(
  hot: ImportMeta['hot'],
  target: Window,
  storage: Storage,
): TailwindDebugState {
  const previousSessionBreadcrumbs = readStoredBreadcrumbs(storage);
  const bootCount = readBootCount(storage) + 1;
  writeBootCount(storage, bootCount);

  const state: TailwindDebugState = {
    bootCount,
    breadcrumbs: [],
    previousSessionBreadcrumbs,
  };

  const append = (phase: string, details?: unknown) => {
    const breadcrumb: HmrBreadcrumb = {
      details,
      href: target.location.href,
      now: target.performance.now(),
      phase,
    };

    state.breadcrumbs = appendBreadcrumb(state.breadcrumbs, breadcrumb);
    writeStoredBreadcrumbs(storage, state.breadcrumbs);
    target.dispatchEvent(
      new CustomEvent(TAILWIND_DEBUG_BREADCRUMB_EVENT, {
        detail: breadcrumb,
      }),
    );
    globalThis.console.info('[tailwind-debug-app]', phase, details ?? {});
  };

  Object.assign(target, {
    __TAILWIND_DEBUG__: state,
  });

  append('bootstrap', {
    previousSessionBreadcrumbs: previousSessionBreadcrumbs.length,
  });

  hot?.on('vite:beforeUpdate', (payload) => {
    append('vite:beforeUpdate', {
      classification: classifyVitePayload(payload),
      payload,
    });
  });
  hot?.on('vite:afterUpdate', (payload) => {
    append('vite:afterUpdate', {
      classification: classifyVitePayload(payload),
      payload,
    });
  });
  hot?.on('vite:beforeFullReload', (payload) => {
    append('vite:beforeFullReload', payload);
  });
  hot?.on('vite:invalidate', (payload) => {
    append('vite:invalidate', payload);
  });

  target.addEventListener('beforeunload', () => {
    append('beforeunload');
  });
  target.addEventListener('pageshow', (event) => {
    append('pageshow', { persisted: event.persisted });
  });
  target.addEventListener('pagehide', (event) => {
    append('pagehide', { persisted: event.persisted });
  });
  target.addEventListener('visibilitychange', () => {
    append('visibilitychange', {
      visibilityState: target.document.visibilityState,
    });
  });
  target.addEventListener('error', (event) => {
    append('window:error', {
      message: event.message,
      source: event.filename,
    });
  });
  target.addEventListener('unhandledrejection', (event) => {
    append('window:unhandledrejection', {
      reason:
        typeof event.reason === 'string' ? event.reason : String(event.reason),
    });
  });

  return state;
}

declare global {
  interface Window {
    __TAILWIND_DEBUG__?: TailwindDebugState;
  }
}
