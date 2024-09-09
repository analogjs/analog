// Credit for modified source: https://github.com/etherCorps/sveltekit-og/blob/main/src/lib/api.ts

import satori from 'satori';
import { html as toReactElement } from 'satori-html';
import sharp from 'sharp';

import { ImageResponseOptions } from './options.js';

export const generateImage = async (
  element: string,
  options: ImageResponseOptions
) => {
  const elementHtml = toReactElement(element);
  const svg = await satori(elementHtml as any, {
    width: options.width || 1200,
    height: options.height || 630,
    fonts: options.fonts?.length ? options.fonts : [],
    tailwindConfig: options.tailwindConfig,
  });
  const svgBuffer = Buffer.from(svg);
  const png = sharp(svgBuffer).png().toBuffer();

  const pngBuffer = await png;

  return pngBuffer;
};

export class ImageResponse extends Response {
  constructor(element: string, options: ImageResponseOptions = {}) {
    super();

    const body = new ReadableStream({
      async start(controller) {
        const buffer = await generateImage(element, options);
        controller.enqueue(buffer);
        controller.close();
      },
    });

    return new Response(body, {
      headers: {
        'Content-Type': 'image/png',
        'Cache-Control': options.debug
          ? 'no-cache, no-store'
          : 'public, immutable, no-transform, max-age=31536000',
        ...options.headers,
      },
      status: options.status || 200,
      statusText: options.statusText,
    });
  }
}
