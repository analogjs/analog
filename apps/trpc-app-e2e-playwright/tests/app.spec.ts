import { Browser, chromium, Page } from 'playwright';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
} from 'vitest';
import { NotesPage } from './fixtures/notes.po';
import { notes } from './fixtures/notes';

type TRPCTestContext = {
  notesPage: NotesPage;
};

let browser: Browser;
let page: Page;

beforeAll(async () => {
  browser = await chromium.launch();
});
afterAll(async () => {
  await browser.close();
});
beforeEach<TRPCTestContext>(async (ctx) => {
  page = await browser.newPage({
    baseURL: 'http://localhost:4205',
  });
  await page.goto('/');
  ctx.notesPage = new NotesPage(page);
});
afterEach(async () => {
  await page.close();
});

describe('tRPC Demo App', () => {
  test(`Given the user has navigated to the home page
    Then the app title is visible`, async () => {
    // Wait for the page to be fully loaded and Angular to be ready
    await page.waitForLoadState('networkidle');

    // Wait for the Angular app to be fully rendered
    await page.waitForSelector('trpc-app-home');

    // Now check for the heading - use a simpler selector that should work
    const heading = page.locator('h1:has-text("Analog + tRPC")');
    await expect(await heading.textContent()).toContain('Analog + tRPC');
  });

  test<TRPCTestContext>(`
  If user enters the first note the note should be stored successfully and listed in the notes array.
  After reloading the page, the first note should show immediately, as the page is server side rendered.
  Still unauthorized, the user should not be able to delete the note and the error should be displayed.
  After the users clicks the "Login" button and gets authorized, deleting the note again should work successfully,
  and the error should disappear.
     `, async (ctx) => {
    await ctx.notesPage.typeNote(notes.first.note);

    await ctx.notesPage.addNote();
    expect(await ctx.notesPage.notes().elementHandles()).toHaveLength(1);

    await ctx.notesPage.page.reload();
    expect(await ctx.notesPage.notes().elementHandles()).toHaveLength(1);

    await ctx.notesPage.removeNote(0);
    expect(await ctx.notesPage.notes().elementHandles()).toHaveLength(1);
    expect(await ctx.notesPage.getDeleteErrorCount()).toBe(1);

    await ctx.notesPage.toggleLogin();
    await ctx.notesPage.removeNote(0);
    await page.waitForSelector('.no-notes');
    expect(await ctx.notesPage.notes().elementHandles()).toHaveLength(0);
    expect(await ctx.notesPage.getDeleteErrorCount()).toBe(0);
  });
});
