import { describe, expect } from 'vitest';
import * as fs from 'node:fs';

vi.mock('fs');

import { contentPlugin } from './content-plugin';

describe('content plugin', () => {
  const [plugin] = contentPlugin({ highlighter: 'prism' });

  // In Vite 8+ the transform hook uses the filtered-transform shape:
  //   transform: { filter: { id: RegExp }, handler: Function }
  // We need to call the handler directly and also inspect the filter to
  // verify module-ID gating.
  const transformObj = plugin.transform as {
    filter: { id: RegExp };
    handler: (code: string, id: string) => any;
  };
  const transform = (code: string, id: string): any => {
    return transformObj.handler.call(plugin, code, id);
  };

  it('should have a filter that only matches analog-content-list modules', () => {
    // The filter.id regex gates which modules reach the handler.
    // Modules without `analog-content-list=true` in their ID should not match.
    expect(transformObj.filter.id.test('/src/content/post.md')).toBe(false);
    expect(
      transformObj.filter.id.test(
        '/src/content/post.md?analog-content-list=true',
      ),
    ).toBe(true);
  });

  it.skip('should cache parsed attributes if the code is the same', async () => {
    // Arrange
    const code =
      '---\n' +
      'title: My First Post\n' +
      'slug: 2022-12-27-my-first-post\n' +
      'description: My First Post Description\n' +
      '---\n' +
      '\n' +
      'Hello World\n';
    const id = '/src/content/post.md?analog-content-list=true';
    const readFileSyncSpy = vi.spyOn(fs, 'readFileSync').mockReturnValue(code);
    const result = {
      code: 'export default {"title":"My First Post","slug":"2022-12-27-my-first-post","description":"My First Post Description"}',
      moduleSideEffects: false,
    };
    // Act & Assert
    expect(await transform(code, id)).toEqual(result);
    expect(await transform(code, id)).toEqual(result);
    // Ensure the `readFileSync` has been called only once.
    expect(readFileSyncSpy).toBeCalledTimes(1);
  });
});
