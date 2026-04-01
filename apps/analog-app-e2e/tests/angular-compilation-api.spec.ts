import { existsSync, writeFileSync, unlinkSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';

const ANALOG_APP_ROOT = join(join(process.cwd(), '../..'), 'apps/analog-app');
const HOT_PAGE_PATH = join(
  ANALOG_APP_ROOT,
  'src/app/pages/compilation-api-test.page.ts',
);
const EXISTING_PAGE_PATH = join(
  ANALOG_APP_ROOT,
  'src/app/pages/package.page.ts',
);

function cleanup() {
  if (existsSync(HOT_PAGE_PATH)) {
    unlinkSync(HOT_PAGE_PATH);
  }
}

test.beforeAll(() => cleanup());
test.afterAll(() => cleanup());
test.beforeEach(() => cleanup());

test.describe('Angular Compilation API', () => {
  test('serves the home page (confirms dev server is using useAngularCompilationAPI)', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.locator('h2').first()).toContainText('Products');
  });

  test.skip('picks up a hot-added page route', async ({ page }) => {
    writeFileSync(
      HOT_PAGE_PATH,
      `import { Component } from '@angular/core';

@Component({
  selector: 'app-compilation-api-test',
  standalone: true,
  template: '<h1>Compilation API Hot Route</h1>',
})
export default class CompilationApiTestPage {}
`,
    );

    await expect(async () => {
      await page.goto('/compilation-api-test');
      await expect(page.locator('h1')).toContainText(
        'Compilation API Hot Route',
      );
    }).toPass({ timeout: 60_000 });

    cleanup();
  });

  // Skipped: requires a live dev server, not the built/prerendered app
  test.skip('reflects an existing page template change during dev', async ({
    page,
  }) => {
    test.setTimeout(45_000);
    const originalPage = readFileSync(EXISTING_PAGE_PATH, 'utf-8');

    try {
      writeFileSync(
        EXISTING_PAGE_PATH,
        `import { Component } from '@angular/core';

@Component({
  standalone: true,
  template: '<h1 id="hmr-target">Before HMR</h1>',
})
export default class PackagePageComponent {}
`,
      );

      await expect(async () => {
        await page.goto('/package');
        await expect(page.locator('#hmr-target')).toHaveText('Before HMR');
      }).toPass({ timeout: 60_000 });

      writeFileSync(
        EXISTING_PAGE_PATH,
        `import { Component } from '@angular/core';

@Component({
  template: '<h1 id="hmr-target">After HMR</h1>',
})
export default class PackagePageComponent {}
`,
      );

      await expect(async () => {
        await page.reload();
        await expect(page.locator('#hmr-target')).toHaveText('After HMR');
      }).toPass({ timeout: 60_000 });
    } finally {
      writeFileSync(EXISTING_PAGE_PATH, originalPage);
    }
  });
});
