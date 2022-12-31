import { Injectable } from '@angular/core';

@Injectable()
export abstract class ContentRenderer {
  async render(content: string): Promise<string> {
    return content;
  }

  enhance() {}
}
