#!/bin/bash
echo "Publishing to $RELEASE_TAG"
npm config set //registry.npmjs.org/:_authToken=$NPM_TOKEN
npm publish node_modules/@analogjs/astro-angular --tag $RELEASE_TAG
npm publish node_modules/@analogjs/content --tag $RELEASE_TAG
npm publish node_modules/@analogjs/platform --tag $RELEASE_TAG
npm publish node_modules/@analogjs/router --tag $RELEASE_TAG
npm publish node_modules/@analogjs/storybook-angular --tag $RELEASE_TAG
npm publish node_modules/@analogjs/vite-plugin-angular --tag $RELEASE_TAG
npm publish node_modules/@analogjs/vite-plugin-nitro --tag $RELEASE_TAG
npm publish node_modules/@analogjs/vitest-angular --tag $RELEASE_TAG
npm publish dist/packages/create-analog --tag $RELEASE_TAG
