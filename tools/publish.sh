#!/bin/bash
echo $TAG
npm config set //registry.npmjs.org/:_authToken=$NPM_TOKEN
npm publish node_modules/@analogjs/astro-angular --access public --tag beta --dry-run
npm publish node_modules/@analogjs/content --access public --tag beta --dry-run
npm publish node_modules/@analogjs/platform --access public --tag beta --dry-run
npm publish node_modules/@analogjs/router --access public --tag beta --dry-run
npm publish node_modules/@analogjs/trpc --access public --tag beta --dry-run
npm publish node_modules/@analogjs/vite-plugin-angular --access public --tag beta --dry-run
npm publish node_modules/@analogjs/vite-plugin-nitro --access public --tag beta --dry-run
npm publish dist/packages/create-analog --tag beta --dry-run
