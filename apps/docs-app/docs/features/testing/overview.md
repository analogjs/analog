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

You can also [add Vitest](/docs/features/testing/vitest) to your existing project.

## Angular support for Vitest

In Angular v21, stable support for Vitest directly through the Angular CLI was introduced for new Angular projects. While both Analog and Angular support running tests with Vitest, there are some similarities and key differences.

The table below shows the features available across both choices.

| Vitest             | Analog    | Angular      |
| ------------------ | --------- | ------------ |
| Angular Versions   | v17+      | v21+         |
| Support            | Community | Angular Team |
| Builders           | ✅        | ✅           |
| Schematics         | ✅        | ✅           |
| Migrations         | ✅        | ✅           |
| Fully Configurable | ✅        | ⚠️           |
| Vitest CLI         | ✅        | ❌           |
| Vitest Workpsaces  | ✅        | ❌           |
| IDE extensions     | ✅        | ❌           |
| Buildable Libs     | ✅        | ❌           |
| Plugins            | ✅        | ❌           |

The table above is not to compare the two solutions, but to provide the information on what features are supported by each implementation. Choose the solution that best fits your needs and priorities.

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

## IDE Support

Tests can also be run directly from your IDE using the Vitest [IDE integrations](https://vitest.dev/guide/ide) for VS Code or JetBrains IDEs.

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
