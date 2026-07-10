import { IMAGE_LOADER, ImageLoaderConfig } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';

import { provideImageLoader } from './image-loader';

function loader(
  options?: Parameters<typeof provideImageLoader>[0],
): (config: ImageLoaderConfig) => string {
  TestBed.configureTestingModule({ providers: [provideImageLoader(options)] });
  return TestBed.inject(IMAGE_LOADER);
}

describe('provideImageLoader', () => {
  it('routes local absolute paths through the endpoint', () => {
    expect(loader()({ src: '/images/hero.png', width: 640 })).toBe(
      '/api/_image/w_640/images/hero.png',
    );
  });

  it('routes allowlisted remote hosts through the endpoint', () => {
    const url = loader({ domains: ['images.example.com'] })({
      src: 'https://images.example.com/x.png',
      width: 640,
    });
    expect(url).toBe(
      '/api/_image/w_640/https%3A%2F%2Fimages.example.com%2Fx.png',
    );
  });

  it('passes non-allowlisted remote hosts through untouched', () => {
    expect(loader()({ src: 'https://other.example/x.png' })).toBe(
      'https://other.example/x.png',
    );
  });

  it('passes data URLs and relative paths through untouched', () => {
    const load = loader();
    expect(load({ src: 'data:image/png;base64,xyz' })).toBe(
      'data:image/png;base64,xyz',
    );
    expect(load({ src: 'images/relative.png' })).toBe('images/relative.png');
  });
});
