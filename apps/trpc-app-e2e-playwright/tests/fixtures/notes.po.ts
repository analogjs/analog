import { Page } from 'playwright';

export class NotesPage {
  constructor(readonly page: Page) {}

  async typeNote(note: string) {
    await this.page.getByTestId('newNoteInput').fill(note);
  }

  async addNote() {
    await this.waitForTrpcResponse(this.page.getByTestId('addNoteBtn').click());
    await this.page.waitForSelector('.note');
  }

  async removeNote(index: number) {
    await this.waitForTrpcResponse(
      this.page.getByTestId('removeNoteAtIndexBtn' + index).click()
    );
    await this.page.waitForSelector('.no-notes');
  }

  notes() {
    return this.page.locator('.note');
  }

  private async waitForTrpcResponse(promise: Promise<void>) {
    await Promise.all([
      this.page.waitForResponse((response) => {
        return response.url().includes('trpc') && response.status() === 200;
      }),
      promise,
    ]);
  }
}
