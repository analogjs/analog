import { Page } from 'playwright';

export class NotesPage {
  constructor(readonly page: Page) {}

  async toggleLogin() {
    await this.page.getByTestId('loginBtn').click();
  }

  async typeNote(note: string) {
    await this.page.getByTestId('newNoteInput').fill(note);
  }

  async addNote() {
    await this.waitForTrpcResponse(
      'note.create',
      this.page.getByTestId('addNoteBtn').click(),
    );
    await this.page.waitForSelector('.note');
  }

  async removeNote(index: number) {
    await this.waitForTrpcResponse(
      'note.remove',
      this.page.getByTestId('removeNoteAtIndexBtn' + index).click(),
    );
  }

  async getDeleteErrorCount() {
    return this.page.locator('[data-testid="deleteError"]').count();
  }

  async waitForDeleteErrorCount(expected: number) {
    await this.page.waitForFunction(
      (count) =>
        document.querySelectorAll('[data-testid="deleteError"]').length ===
        count,
      expected,
    );
  }

  async waitForNoteCount(expected: number) {
    await this.page.waitForFunction(
      (count) => document.querySelectorAll('.note').length === count,
      expected,
    );
  }

  notes() {
    return this.page.locator('.note');
  }

  private async waitForTrpcResponse(procedure: string, promise: Promise<void>) {
    await Promise.all([
      this.page.waitForResponse((response) => {
        return response.url().includes(`/api/trpc/${procedure}`);
      }),
      promise,
    ]);
  }
}
