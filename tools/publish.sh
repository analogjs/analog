#!/bin/bash
echo "Publishing to $RELEASE_TAG"
npm config set //registry.npmjs.org/:_authToken=$NPM_TOKEN
npm publish node_modules/@analogjs/astro-angular --access public --tag $RELEASE_TAG
npm publish node_modules/@analogjs/content --access public --tag $RELEASE_TAG
npm publish node_modules/@analogjs/platform --access public --tag $RELEASE_TAG
npm publish node_modules/@analogjs/router --access public --tag $RELEASE_TAG
npm publish node_modules/@analogjs/vite-plugin-angular --access public --tag $RELEASE_TAG
npm publish node_modules/@analogjs/vite-plugin-nitro --access public --tag $RELEASE_TAG
npm publish node_modules/@analogjs/vitest-angular --access public --tag $RELEASE_TAG
npm publish dist/packages/create-analog --tag $RELEASE_TAG
