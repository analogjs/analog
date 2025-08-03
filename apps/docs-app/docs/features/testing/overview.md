---
title: Testing in Analog - Unit Testing with Vitest
description: Learn how to run unit tests in Analog using Vitest. Understand testing features, Jest compatibility, and best practices for testing Angular applications.
keywords:
  [
    'testing',
    'unit tests',
    'Vitest',
    'Jest',
    'Angular testing',
    'test runner',
    'jsdom',
  ]
image: https://analogjs.org/img/analog-banner.png
url: https://analogjs.org/docs/features/testing/overview
type: documentation
author: Analog Team
publishedTime: '2022-01-01T00:00:00.000Z'
modifiedTime: '2024-01-01T00:00:00.000Z'
section: Testing
tags: ['testing', 'vitest', 'unit-tests']
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Running Tests

Analog supports [Vitest](https://vitest.dev) for running unit tests.

## Vitest Features

Vitest supports many features:

- A Jest-compatible API.
- Supports Vite's config, transforms, resolvers, and plugins.
- Smart & instant watch mode.
- TypeScript support.
- Jest-compatible snapshots.
- jsdom for DOM mocking.
- In-source testing.
- And more ...

## Running Unit Tests

To run unit tests, use the `test` command:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm run test
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn test
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm run test
```

  </TabItem>
</Tabs>

You can also [add Vitest](/docs/features/testing/vitest) to your existing project.

## Known limitations

- Only globals are patched with Zone.js. This means, that if you import `it`, `describe` etc from `vitest` directly, you won't be able to run `fakeAsync`. Instead, use the functions (`it`, `describe` etc. the way you used to do in Jest/Jasmine – without any imports of these functions in the test file).
- `vmThreads` is used. This can lead to potential memory leaks and is used as a default to provide an environment closer to the Jest with JSDOM. More details you can read [here](https://github.com/vitest-dev/vitest/issues/4685).

  To change that – adjust your `vite.config.mts`

  ```typescript
  export default defineConfig(({ mode }) => {
    return {
      test: {
        pool: 'threads', // add this property
      },
    };
  });
  ```
