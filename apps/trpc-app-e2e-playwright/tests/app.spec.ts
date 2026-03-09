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
    const heading = page.getByRole('heading', {
      level: 1,
      name: /Analog \+ tRPC/i,
    });
    await heading.waitFor();
    expect(await heading.isVisible()).toBe(true);
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
    await ctx.notesPage.waitForNoteCount(1);
    expect(await ctx.notesPage.notes().count()).toBe(1);

    await ctx.notesPage.page.reload();
    await ctx.notesPage.waitForNoteCount(1);
    expect(await ctx.notesPage.notes().count()).toBe(1);

    await ctx.notesPage.removeNote(0);
    await ctx.notesPage.waitForNoteCount(1);
    await ctx.notesPage.waitForDeleteErrorCount(1);
    expect(await ctx.notesPage.notes().count()).toBe(1);
    expect(await ctx.notesPage.getDeleteErrorCount()).toBe(1);

    await ctx.notesPage.toggleLogin();
    await ctx.notesPage.removeNote(0);
    await page.waitForSelector('.no-notes');
    await ctx.notesPage.waitForNoteCount(0);
    await ctx.notesPage.waitForDeleteErrorCount(0);
    expect(await ctx.notesPage.notes().count()).toBe(0);
    expect(await ctx.notesPage.getDeleteErrorCount()).toBe(0);
  }, 20000);
});
