import { describe, expect } from 'vitest';
import * as fs from 'node:fs';

vi.mock('fs');

import { contentPlugin } from './content-plugin';

describe('content plugin', () => {
  const [plugin] = contentPlugin();
  const transform = (code: string, id: string): any => {
    // Use `any` because not of the signatures are callable and it also expects
    // to pass a valid `this` type.
    const pluginTransform: any = plugin.transform;
    return pluginTransform(code, id);
  };

  it('should skip transforming code if there is no `analog-content-list` at the end', async () => {
    // Arrange
    const code = 'Some_code';
    const id = '/src/content/post.md';
    // Act & Assert
    expect(await transform(code, id)).toEqual(undefined);
  });

  it('should cache parsed attributes if the code is the same', async () => {
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
    const result =
      'export default {"title":"My First Post","slug":"2022-12-27-my-first-post","description":"My First Post Description"}';
    // Act & Assert
    expect(await transform(code, id)).toEqual(result);
    expect(await transform(code, id)).toEqual(result);
    // Ensure the `readFileSync` has been called only once.
    expect(readFileSyncSpy).toBeCalledTimes(1);
  });
});
