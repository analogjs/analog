import { expect, test } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

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

function replaceProbeColor(className: string) {
  const nextCss = ORIGINAL_CSS.replace(BLUE_CLASS, className).replace(
    RED_CLASS,
    className,
  );
  writeFileSync(STYLE_PROBE_CSS_PATH, nextCss, 'utf8');
}

function truncateDebugLogs() {
  writeFileSync(WS_LOG_PATH, '', 'utf8');
  writeFileSync(HMR_LOG_PATH, '', 'utf8');
}

test.beforeEach(() => {
  replaceProbeColor(BLUE_CLASS);
  truncateDebugLogs();
});

test.afterAll(() => {
  replaceProbeColor(BLUE_CLASS);
});

test('updates the component stylesheet without a full reload', async ({
  page,
}) => {
  await page.goto('/');
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
      async () =>
        page.getByTestId('probe-card').evaluate((element) => {
          return window.getComputedStyle(element).backgroundColor;
        }),
      { timeout: 30_000 },
    )
    .toBe('rgb(239, 68, 68)');

  await expect(page.getByTestId('probe-counter')).toContainText('Clicks 1');

  await expect
    .poll(
      async () => page.evaluate(() => window.__TAILWIND_DEBUG__?.bootCount),
      { timeout: 10_000 },
    )
    .toBe(initialBootCount);

  const wsLog = readFileSync(WS_LOG_PATH, 'utf8');
  const hmrLog = readFileSync(HMR_LOG_PATH, 'utf8');

  expect(wsLog).toContain('"type":"css-update"');
  expect(wsLog).not.toContain('"type":"full-reload"');
  expect(hmrLog).toContain('style-probe.component.css');
});
