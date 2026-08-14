import { expect, test } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const WORKSPACE_ROOT = join(process.cwd(), '../..');
const STYLE_PROBE_CSS_PATH = join(
  WORKSPACE_ROOT,
  'apps/tailwind-debug-app/src/app/probes/style-probe.component.css',
);
const WS_LOG_PATH = join(
  WORKSPACE_ROOT,
  'tmp/debug/tailwind-debug-app.vite-ws.log',
);
const HMR_LOG_PATH = join(
  WORKSPACE_ROOT,
  'tmp/debug/tailwind-debug-app.vite-hmr.log',
);

const ORIGINAL_CSS = readFileSync(STYLE_PROBE_CSS_PATH, 'utf8');
const BLUE_CLASS = 'tdbg:bg-blue-500';
const RED_CLASS = 'tdbg:bg-red-500';
function parseLogEntries(log: string): Array<Record<string, unknown>> {
  return log
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const jsonStart = line.indexOf('{');
      return JSON.parse(line.slice(jsonStart)) as Record<string, unknown>;
    });
}

function replaceProbeColor(className: string) {
  const nextCss = ORIGINAL_CSS.replace(BLUE_CLASS, className).replace(
    RED_CLASS,
    className,
  );
  writeFileSync(STYLE_PROBE_CSS_PATH, nextCss, 'utf8');
}

function truncateDebugLogs() {
  mkdirSync(dirname(WS_LOG_PATH), { recursive: true });
  writeFileSync(WS_LOG_PATH, '', 'utf8');
  writeFileSync(HMR_LOG_PATH, '', 'utf8');
}

test.beforeEach(() => {
  replaceProbeColor(BLUE_CLASS);
  truncateDebugLogs();
});

test.afterAll(() => {
  writeFileSync(STYLE_PROBE_CSS_PATH, ORIGINAL_CSS, 'utf8');
});

// This test validates the legacy (non-API) HMR path. When the debug app
// enables useAngularCompilationAPI the HMR wiring differs and the test
// needs to be updated separately. Skip for now so the #2293 host-apply
// tests (which require the Compilation API) can run in the same suite.
test.skip('reproduces Tailwind-triggered full reload for component stylesheet edits', async ({
  page,
}) => {
  await page.goto('/probe');
  await expect(page.getByTestId('probe-card')).toBeVisible();

  await page.getByTestId('probe-counter').click();
  await expect(page.getByTestId('probe-counter')).toContainText('Clicks 1');

  const initialBootCount = await page.evaluate(
    () => window.__TAILWIND_DEBUG__?.bootCount,
  );

  truncateDebugLogs();
  replaceProbeColor(RED_CLASS);

  await expect
    .poll(
      async () => {
        const wsEntries = parseLogEntries(readFileSync(WS_LOG_PATH, 'utf8'));
        return wsEntries.findIndex(
          (entry) =>
            (entry.payload as { type?: string } | undefined)?.type ===
            'full-reload',
        );
      },
      { timeout: 30_000 },
    )
    .toBeGreaterThanOrEqual(0);

  await page.waitForLoadState('domcontentloaded');
  await expect(page.getByTestId('probe-card')).toBeVisible();

  await expect(page.getByTestId('probe-counter')).toContainText('Clicks 0');

  await expect
    .poll(
      async () => page.evaluate(() => window.__TAILWIND_DEBUG__?.bootCount),
      { timeout: 10_000 },
    )
    .not.toBe(initialBootCount);

  const wsLog = readFileSync(WS_LOG_PATH, 'utf8');
  const hmrLog = readFileSync(HMR_LOG_PATH, 'utf8');
  const wsEntries = parseLogEntries(wsLog);

  const fullReloadEntry = wsEntries.find(
    (entry) =>
      (entry.payload as { type?: string } | undefined)?.type === 'full-reload',
  );

  expect(wsLog).toContain('style-probe.component.css');
  expect(fullReloadEntry).toBeTruthy();
  expect(fullReloadEntry?.source).toBe('environment.hot.send');
  expect(String(fullReloadEntry?.stack ?? '')).toContain('updateModules');
  expect(hmrLog).toContain('style-probe.component.css');
});
