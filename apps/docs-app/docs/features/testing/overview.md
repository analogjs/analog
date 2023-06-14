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
