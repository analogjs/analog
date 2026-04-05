import { defineHandler } from 'nitro/h3';

import { ImageResponse } from '@analogjs/content/og';

export default defineHandler(async (event) => {
  const fontFile = await fetch(
    'https://og-playground.vercel.app/inter-latin-ext-700-normal.woff',
  );
  const fontData: ArrayBuffer = await fontFile.arrayBuffer();
  const title = event.url.searchParams.get('title') ?? 'Hello World';
  const base = event.url.origin;

  const template = `
    <div tw="bg-gray-50 flex w-full h-full items-center justify-center">
        <div tw="flex flex-col items-center w-full py-12 px-4 p-8">
          <div tw="flex">
            <img src="${base}/analog.svg" width="600" height="450"/>

            <img src="${base}/angular-gradient.png" width="400" height="400"/>
          </div>
          <h2 tw="flex flex-col text-3xl sm:text-4xl font-bold tracking-tight text-gray-900 text-left">
            <span>${title}</span>
          </h2>
        </div>
      </div>    
  `;

  return new ImageResponse(template, {
    // debug: false, // disable caching
    fonts: [
      {
        name: 'Inter Latin',
        data: fontData,
        style: 'normal',
      },
    ],
  });
});
