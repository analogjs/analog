#!/bin/bash
echo "Publishing to $RELEASE_TAG"
npm publish packages/astro-angular/dist --tag $RELEASE_TAG
npm publish packages/content/dist --tag $RELEASE_TAG
npm publish packages/platform/dist --tag $RELEASE_TAG
npm publish packages/router/dist --tag $RELEASE_TAG
npm publish packages/storybook-angular/dist --tag $RELEASE_TAG
npm publish packages/vite-plugin-angular/dist --tag $RELEASE_TAG
npm publish packages/vite-plugin-nitro/dist --tag $RELEASE_TAG
npm publish packages/vitest-angular/dist --tag $RELEASE_TAG
npm publish dist/packages/create-analog --tag $RELEASE_TAG
