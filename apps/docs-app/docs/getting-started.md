---
sidebar_position: 2
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Getting Started

## Creating a New Application

Scaffold an Analog project with the following `create-analog` command:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm create analog@latest
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn create analog
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm create analog
```

  </TabItem>
</Tabs>

## Building the Application

To build the application for deployment

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm run build
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn build
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm run build
```

  </TabItem>
</Tabs>

## Running Tests

Analog supports [Vitest](https://vitest.dev) for running unit tests. To run unit tests:

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

## System Requirements

Analog requires the following Node and Angular versions:

- Node v16 or higher
- Angular v14.2 or higher
