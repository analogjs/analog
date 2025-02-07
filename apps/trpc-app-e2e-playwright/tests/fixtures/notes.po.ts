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
    await this.waitForTrpcResponse(this.page.getByTestId('addNoteBtn').click());
    await this.page.waitForSelector('.note');
  }

  async removeNote(index: number) {
    await this.waitForTrpcResponse(
      this.page.getByTestId('removeNoteAtIndexBtn' + index).click(),
    );
  }

  async getDeleteErrorCount() {
    return this.page.locator('[data-testid="deleteError"]').count();
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
