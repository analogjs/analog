import { TestBed } from '@angular/core/testing';
import { provideContentFiles } from '@analogjs/content';

import { fromContentDir } from './prerender-content';

describe('fromContentDir', () => {
  const run = <T>(fn: () => T): T => {
    TestBed.configureTestingModule({
      providers: [
        provideContentFiles({
          list: {
            '/src/content/first.md': {},
            '/src/content/second.md': { category: 'news' },
            '/src/content/nested/deep.md': {},
          },
          files: {},
        }),
      ],
    });
    return TestBed.runInInjectionContext(fn);
  };

  it('fills slug per top-level content file', () => {
    expect(run(fromContentDir('src/content'))).toEqual([
      { slug: 'first' },
      { slug: 'second' },
    ]);
  });

  it('maps and skips files through the transform', () => {
    expect(
      run(
        fromContentDir('src/content', (file) =>
          file.attributes['category'] === 'news'
            ? { slug: file.slug, category: 'news' }
            : false,
        ),
      ),
    ).toEqual([{ slug: 'second', category: 'news' }]);
  });
});
