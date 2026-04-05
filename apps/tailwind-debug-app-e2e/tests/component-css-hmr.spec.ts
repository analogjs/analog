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
const RED_BACKGROUND_VALUES = new Set([
  'rgb(239, 68, 68)',
  'oklch(0.637 0.237 25.331)',
]);

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

test('updates the component stylesheet without a full reload', async ({
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
        const backgroundColor = await page
          .getByTestId('probe-card')
          .evaluate((element) => {
            return window.getComputedStyle(element).backgroundColor;
          });

        return RED_BACKGROUND_VALUES.has(backgroundColor);
      },
      { timeout: 30_000 },
    )
    .toBe(true);

  await expect(page.getByTestId('probe-counter')).toContainText('Clicks 1');

  await expect
    .poll(
      async () => page.evaluate(() => window.__TAILWIND_DEBUG__?.bootCount),
      { timeout: 10_000 },
    )
    .toBe(initialBootCount);

  const wsLog = readFileSync(WS_LOG_PATH, 'utf8');
  const hmrLog = readFileSync(HMR_LOG_PATH, 'utf8');

  expect(wsLog).toContain('style-probe.component.css');
  expect(wsLog).not.toContain('"type":"full-reload"');
  expect(hmrLog).toContain('style-probe.component.css');
});
