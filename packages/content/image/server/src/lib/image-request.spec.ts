import { describe, expect, it } from 'vitest';

import {
  IMAGE_HANDLER_DEFAULTS,
  negotiateFormat,
  parseImageRequest,
} from './image-request';

const defaults = IMAGE_HANDLER_DEFAULTS;

describe('parseImageRequest', () => {
  it('parses a local request with width and quality', () => {
    const request = parseImageRequest('w_640,q_75/images/hero.png', defaults);
    expect(request).toEqual({
      src: '/images/hero.png',
      remote: false,
      width: 640,
      quality: 75,
      format: undefined,
    });
  });

  it('parses the empty modifiers placeholder', () => {
    const request = parseImageRequest('_/images/hero.png', defaults);
    expect(request.src).toBe('/images/hero.png');
    expect(request.width).toBeUndefined();
  });

  it('parses a fixed format modifier', () => {
    const request = parseImageRequest('w_640,f_webp/a.png', defaults);
    expect(request.format).toBe('webp');

    expect(() => parseImageRequest('f_bmp/a.png', defaults)).toThrow(
      'f must be avif or webp',
    );
  });

  it('rejects missing src and malformed modifiers', () => {
    expect(() => parseImageRequest('w_640', defaults)).toThrow(
      'expected <modifiers>/<src>',
    );
    expect(() => parseImageRequest('w_640/', defaults)).toThrow(
      'src is required',
    );
    expect(() => parseImageRequest('images/hero.png', defaults)).toThrow(
      'invalid modifiers',
    );
  });

  it('rejects traversal paths', () => {
    expect(() =>
      parseImageRequest('_/images/../../etc/passwd', defaults),
    ).toThrow('invalid src path');
    expect(() =>
      parseImageRequest('_/images/%2E%2E/secret.png', defaults),
    ).toThrow('invalid src path');
  });

  it('rejects remote hosts unless allowlisted', () => {
    expect(() =>
      parseImageRequest(
        `_/${encodeURIComponent('https://evil.example/x.png')}`,
        defaults,
      ),
    ).toThrow('remote host not allowed');

    const request = parseImageRequest(
      `w_640/${encodeURIComponent('https://images.example.com/x.png')}`,
      { ...defaults, domains: ['images.example.com'] },
    );
    expect(request.remote).toBe(true);
    expect(request.src).toBe('https://images.example.com/x.png');
  });

  it('rejects invalid width and clamps to maxWidth', () => {
    expect(() => parseImageRequest('w_0/a.png', defaults)).toThrow(
      'positive integer',
    );
    expect(() => parseImageRequest('w_abc/a.png', defaults)).toThrow(
      'positive integer',
    );

    const clamped = parseImageRequest('w_9999/a.png', defaults);
    expect(clamped.width).toBe(defaults.maxWidth);
  });

  it('rejects out-of-range quality', () => {
    expect(() => parseImageRequest('q_0/a.png', defaults)).toThrow(
      'between 1 and 100',
    );
    expect(() => parseImageRequest('q_101/a.png', defaults)).toThrow(
      'between 1 and 100',
    );
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
