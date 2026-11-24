import { expect, test } from '@playwright/test';

/**
 * Validates that @apply inside :host {} with a Tailwind prefix (tdbg:)
 * produces real CSS properties in the browser.
 *
 * This is the core regression test for analogjs/analog#2293: without the
 * fix, @tailwindcss/vite may not resolve @apply directives before Angular's
 * ShadowCss rewrites :host selectors, causing the styles to silently vanish.
 */

test.describe(':host @apply with Tailwind prefix (#2293)', () => {
  test('applies :host styles from @apply with tdbg: prefix', async ({
    page,
  }) => {
    await page.goto('/probe');
    const hostProbe = page.getByTestId('host-probe-card');
    await expect(hostProbe).toBeVisible();

    // The :host selector receives @apply tdbg:block tdbg:bg-emerald-600
    // tdbg:p-8 tdbg:text-white tdbg:rounded-[2rem] ... — verify the
    // resolved CSS properties are actually applied in the browser.
    //
    // We check the host element (<app-host-style-probe>) since :host
    // targets the component's outer element after Angular encapsulation.
    const hostElement = page.locator('app-host-style-probe');
    await expect(hostElement).toBeVisible();

    const styles = await hostElement.evaluate((el) => {
      const computed = window.getComputedStyle(el);
      return {
        display: computed.display,
        backgroundColor: computed.backgroundColor,
        padding: computed.padding,
        borderRadius: computed.borderRadius,
      };
    });

    // display: block (from tdbg:block)
    expect(styles.display).toBe('block');

    // background-color: emerald-600 — the exact RGB varies by Tailwind
    // version, but it must NOT be transparent/empty (the failure mode).
    expect(styles.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(styles.backgroundColor).not.toBe('transparent');
    expect(styles.backgroundColor).toBeTruthy();

    // padding: 2rem (from tdbg:p-8)
    expect(styles.padding).toBe('32px');

    // border-radius: 2rem (from tdbg:rounded-[2rem])
    expect(styles.borderRadius).toBe('32px');
  });

  test(':host probe card has visible text content', async ({ page }) => {
    await page.goto('/probe');
    const title = page.getByTestId('host-probe-card').locator('h2');
    await expect(title).toContainText('@apply inside :host probe');
  });
});
