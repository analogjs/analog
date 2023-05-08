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
  // await page.close();
});

describe('tRPC Demo App', () => {
  test(`Given the user has navigated to the home page
    Then the app title is visible`, async () => {
    await expect(
      page.locator('role=heading[level=1] >> text=Analog + tRPC')
    ).toContain(/Analog + tRPC/i);
  });

  test<TRPCTestContext>(`If user enters the first note the note should be stored
    successfully and listed in the notes array`, async (ctx) => {
    await ctx.notesPage.typeNote(notes.first.note);

    await ctx.notesPage.addNote();
    expect(await ctx.notesPage.notes().elementHandles()).toHaveLength(1);

    await ctx.notesPage.removeNote(0);
    expect(await ctx.notesPage.notes().elementHandles()).toHaveLength(0);
  });
});
