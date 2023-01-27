import { TestBed } from '@angular/core/testing';
import { CONTENT_FILES_TOKEN } from './content-files-token';

vi.mock('./get-content-files', () => {
  return {
    getContentFilesList: () => ({
      '/test.md': '---\ntitle: Test\n---\n# Hello World',
    }),
  };
});
describe('CONTENT_FILES_TOKEN', () => {
  it('should be the token', () => {
    const { CONTENT_FILES_TOKEN } = setup();
    const firstParsedFile = CONTENT_FILES_TOKEN[0];
    expect(CONTENT_FILES_TOKEN).toBeTruthy();
    expect(firstParsedFile.filename).toEqual('/test.md');
    expect(firstParsedFile.attributes['title']).toEqual('Test');
  });

  function setup() {
    TestBed.configureTestingModule({});
    return {
      CONTENT_FILES_TOKEN: TestBed.inject(CONTENT_FILES_TOKEN),
    };
  }
});
