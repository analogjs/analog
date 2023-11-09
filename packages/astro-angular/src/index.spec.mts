import astroPlugin from './index';

describe('angularVitePlugin', () => {
  it('should return astro configurations', () => {
    expect(astroPlugin().name).toEqual('@analogjs/astro-angular');
    expect(astroPlugin().hooks).toStrictEqual({
      'astro:config:setup': expect.anything(),
      'astro:config:done': expect.anything(),
      'astro:build:setup': expect.anything(),
    });
  });
});
