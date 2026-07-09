import { describe, expect, it } from 'vitest';

import {
  IMAGE_HANDLER_DEFAULTS,
  negotiateFormat,
  parseImageRequest,
} from './image-request';

const defaults = IMAGE_HANDLER_DEFAULTS;

describe('parseImageRequest', () => {
  it('parses a local request with width and quality', () => {
    const request = parseImageRequest(
      { src: '/images/hero.png', w: '640', q: '75' },
      defaults,
    );
    expect(request).toEqual({
      src: '/images/hero.png',
      remote: false,
      width: 640,
      quality: 75,
    });
  });

  it('rejects missing src', () => {
    expect(() => parseImageRequest({}, defaults)).toThrow('src is required');
  });

  it('rejects relative and traversal paths', () => {
    expect(() =>
      parseImageRequest({ src: 'images/hero.png' }, defaults),
    ).toThrow('absolute path');
    expect(() =>
      parseImageRequest({ src: '/images/../../etc/passwd' }, defaults),
    ).toThrow('invalid src path');
  });

  it('rejects remote hosts unless allowlisted', () => {
    expect(() =>
      parseImageRequest({ src: 'https://evil.example/x.png' }, defaults),
    ).toThrow('remote host not allowed');

    const request = parseImageRequest(
      { src: 'https://images.example.com/x.png' },
      { ...defaults, domains: ['images.example.com'] },
    );
    expect(request.remote).toBe(true);
  });

  it('rejects invalid width and clamps to maxWidth', () => {
    expect(() =>
      parseImageRequest({ src: '/a.png', w: '-2' }, defaults),
    ).toThrow('positive integer');
    expect(() =>
      parseImageRequest({ src: '/a.png', w: 'abc' }, defaults),
    ).toThrow('positive integer');

    const clamped = parseImageRequest({ src: '/a.png', w: '9999' }, defaults);
    expect(clamped.width).toBe(defaults.maxWidth);
  });

  it('rejects out-of-range quality', () => {
    expect(() =>
      parseImageRequest({ src: '/a.png', q: '0' }, defaults),
    ).toThrow('between 1 and 100');
    expect(() =>
      parseImageRequest({ src: '/a.png', q: '101' }, defaults),
    ).toThrow('between 1 and 100');
  });
});

describe('negotiateFormat', () => {
  it('picks the first accepted format', () => {
    expect(negotiateFormat('image/avif,image/webp,*/*', ['avif', 'webp'])).toBe(
      'avif',
    );
    expect(negotiateFormat('image/webp,*/*', ['avif', 'webp'])).toBe('webp');
  });

  it('returns null when nothing matches', () => {
    expect(negotiateFormat('image/png', ['avif', 'webp'])).toBeNull();
    expect(negotiateFormat(undefined, ['avif', 'webp'])).toBeNull();
  });
});
