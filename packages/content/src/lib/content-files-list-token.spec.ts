import { TestBed } from '@angular/core/testing';
import { CONTENT_FILES_LIST_TOKEN } from './content-files-list-token';

vi.mock('./get-content-files', () => {
  return {
    getContentFilesList: () => ({
      '/test.md': { title: 'Test' },
      '/path/to/test.md': { title: 'Test' },
      '\\path\\to\\test.md': { title: 'Test' },
      '/path/to/test with spaces.md': { title: 'Test' },
    }),
  };
});
describe('CONTENT_FILES_LIST_TOKEN', () => {
  it('should be the token', () => {
    const { CONTENT_FILES_LIST_TOKEN } = setup();
    const firstParsedFile = CONTENT_FILES_LIST_TOKEN[0];
    expect(CONTENT_FILES_LIST_TOKEN).toBeTruthy();
    expect(firstParsedFile.filename).toEqual('/test.md');
    expect(firstParsedFile.slug).toEqual('test');
    expect(firstParsedFile.attributes['title']).toEqual('Test');
  });

  it('should extract the slug from nested path', () => {
    const { CONTENT_FILES_LIST_TOKEN } = setup();
    const firstParsedFile = CONTENT_FILES_LIST_TOKEN[1];
    expect(CONTENT_FILES_LIST_TOKEN).toBeTruthy();
    expect(firstParsedFile.slug).toEqual('test');
  });

  it('should extract the slug from nested path (windows)', () => {
    const { CONTENT_FILES_LIST_TOKEN } = setup();
    const firstParsedFile = CONTENT_FILES_LIST_TOKEN[2];
    expect(CONTENT_FILES_LIST_TOKEN).toBeTruthy();
    expect(firstParsedFile.slug).toEqual('test');
  });

  it('should extract the slug without spaces', () => {
    const { CONTENT_FILES_LIST_TOKEN } = setup();
    const firstParsedFile = CONTENT_FILES_LIST_TOKEN[3];
    expect(CONTENT_FILES_LIST_TOKEN).toBeTruthy();
    expect(firstParsedFile.slug).toEqual('test%20with%20spaces');
  });

  function setup() {
    TestBed.configureTestingModule({});
    return {
      CONTENT_FILES_LIST_TOKEN: TestBed.inject(CONTENT_FILES_LIST_TOKEN),
    };
  }
});
