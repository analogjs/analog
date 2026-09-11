import { chromium, type Browser } from 'playwright';
import { afterAll, beforeAll, expect, test } from 'vitest';

const baseURL = process.env['E2E_BASE_URL'] ?? 'http://localhost:3211';
let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch({
    executablePath: process.env['PW_EXECUTABLE_PATH'],
  });
});

afterAll(async () => {
  await browser.close();
});

test('streams request-local success and error views, and buffers for crawlers', async () => {
  async function read(path: string, bot = false) {
    const response = await fetch(`${baseURL}${path}`, {
      headers: { 'user-agent': bot ? 'Googlebot' : 'Analog streaming test' },
    });
    expect(response.status).toBe(200);
    const chunks: string[] = [];
    const decoder = new TextDecoder();
    for await (const bytes of response.body!)
      chunks.push(decoder.decode(bytes, { stream: true }));
    return chunks.join('');
  }
  const [success, failure, buffered] = await Promise.all([
    read('/resource-tracking'),
    read('/resource-tracking?fail=true'),
    read('/resource-tracking', true),
  ]);
  for (const html of [success, failure]) {
    const shell = html.indexOf('<template data-analog-shell>');
    const profile = html.indexOf('<template data-analog-settled="u0">');
    const activity = html.indexOf('<template data-analog-settled="u1">');
    const tail = html.indexOf('<template data-analog-authoritative>');
    expect(shell).toBeGreaterThan(-1);
    expect(profile).toBeGreaterThan(shell);
    expect(activity).toBeGreaterThan(profile);
    expect(tail).toBeGreaterThan(activity);
    expect(html.slice(shell, profile)).toContain('Loading dashboard');
    expect(html.slice(profile, activity)).toContain('Ada Lovelace');
    expect(html.slice(profile, activity)).toContain('Loading activity');
  }
  expect(success).toContain('Three recent updates');
  expect(success).not.toContain('class="activity-error"');
  expect(failure).toContain('class="activity-error"');
  expect(failure).not.toContain('Three recent updates');
  expect(buffered).toContain('Three recent updates');
  expect(buffered).not.toContain('data-analog-shell');
  expect(buffered).not.toContain('analog-settled:');
});

test('keeps the streamed error visible through hydration and can retry successfully', async () => {
  const page = await browser.newPage({ userAgent: 'Analog streaming test' });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /NG\d+/.test(message.text()))
      errors.push(message.text());
  });
  await page.addInitScript(() => {
    const phases: string[] = [];
    Object.assign(window, { errorPhases: phases });
    new MutationObserver(() => {
      const visible = (selector: string) =>
        Array.from(document.querySelectorAll(selector)).some(
          (element) => element.getClientRects().length > 0,
        );
      const phase = visible('.activity-error')
        ? 'error'
        : visible('.activity-loading')
          ? 'loading'
          : visible('.dashboard-loading')
            ? 'dashboard'
            : 'none';
      if (phases.at(-1) !== phase) phases.push(phase);
    }).observe(document, { childList: true, subtree: true, attributes: true });
  });
  try {
    await page.goto(`${baseURL}/resource-tracking?fail=true`, {
      waitUntil: 'networkidle',
    });
    await page
      .locator('[data-analog-hydrating]')
      .waitFor({ state: 'detached' });
    await page.locator('.activity-error').waitFor();
    const phases = await page.evaluate(
      () => (window as unknown as { errorPhases: string[] }).errorPhases,
    );
    expect(phases).toContain('error');
    expect(phases.slice(phases.indexOf('error'))).toEqual(['error']);
    expect(await page.locator('.profile-counter').count()).toBe(1);
    await page.locator('.run-success').click();
    await page.locator('.activity-result').waitFor();
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
});

test('resource tracking views hydrate without refetching, then reveal nested loading and error states', async () => {
  const page = await browser.newPage({ userAgent: 'Analog streaming test' });
  const errors: string[] = [];
  const requests: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && /NG\d+/.test(message.text()))
      errors.push(message.text());
  });
  page.on('request', (request) => {
    if (request.url().includes('/api/resource-tracking'))
      requests.push(request.url());
  });
  await page.addInitScript(() => {
    const phases: string[] = [];
    Object.assign(window, { resourceTrackingPhases: phases });
    new MutationObserver(() => {
      const region = document.querySelector('[data-analog-stream]');
      if (region?.querySelector('.dashboard-loading')) phases.push('shell');
      if (
        region?.querySelector('.profile-counter') &&
        region.querySelector('.activity-loading')
      )
        phases.push('profile');
    }).observe(document, { childList: true, subtree: true });
  });
  try {
    const response = await page.goto(`${baseURL}/resource-tracking`, {
      waitUntil: 'networkidle',
    });
    expect(response?.status()).toBe(200);
    const html = await response!.text();
    expect(html).toContain('Ada Lovelace');
    expect(html).toContain('Three recent updates');
    expect(requests).toEqual([]);
    const phases = await page.evaluate(
      () =>
        (window as unknown as { resourceTrackingPhases: string[] })
          .resourceTrackingPhases,
    );
    expect(phases).toContain('shell');
    expect(phases).toContain('profile');
    expect(phases.indexOf('shell')).toBeLessThan(phases.indexOf('profile'));
    await page
      .locator('[data-analog-hydrating]')
      .waitFor({ state: 'detached' });
    await page.locator('.profile-counter').click();
    await expect
      .poll(() => page.locator('.profile-counter').textContent())
      .toContain('Count: 1');

    // Hold each client response so ordering assertions do not depend on timers.
    let releaseProfile!: () => void;
    let releaseActivity!: () => void;
    const profileGate = new Promise<void>(
      (resolve) => (releaseProfile = resolve),
    );
    const activityGate = new Promise<void>(
      (resolve) => (releaseActivity = resolve),
    );
    await page.route('**/api/resource-tracking?*', async (route) => {
      const profile = route.request().url().includes('section=profile');
      await (profile ? profileGate : activityGate);
      await route.fulfill({
        status: profile ? 200 : 503,
        contentType: 'application/json',
        body: JSON.stringify(
          profile ? { label: 'Ada Lovelace' } : { message: 'Unavailable' },
        ),
      });
    });
    await page.locator('.run-error').click();
    await page.locator('.dashboard-loading').waitFor();
    expect(await page.locator('.profile-counter').count()).toBe(0);
    releaseProfile();
    await page.locator('.profile-counter').waitFor();
    expect(await page.locator('.activity-loading').count()).toBe(1);
    releaseActivity();
    await page.locator('.activity-error').waitFor();
    expect(await page.locator('.dashboard-error').count()).toBe(0);
    expect(errors).toEqual([]);
    await page.locator('.profile-counter').click();
    await expect
      .poll(() => page.locator('.profile-counter').textContent())
      .toContain('Count: 1');

    await page.unroute('**/api/resource-tracking?*');
    await page.locator('.run-success').click();
    await page.locator('.activity-result').waitFor();
    expect(await page.locator('.activity-result').textContent()).toContain(
      'Three recent updates',
    );
    expect(await page.locator('.activity-error').count()).toBe(0);
    expect(errors).toEqual([]);
  } finally {
    await page.close();
  }
});
