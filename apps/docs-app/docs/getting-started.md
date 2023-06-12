---
sidebar_position: 2
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Getting Started

## System Requirements

Analog requires the following Node and Angular versions:

- Node v16 or higher
- Angular v15 or higher

## Creating a New Application

There are two methods for creating an Analog application. You have the option to utilize the `create-analog` command
to scaffold a standalone project, or you can make use of the Nx plugin, which is included in the `@analogjs/platform` package.

<Tabs groupId="app-creator">
  <TabItem label="create-analog" value="create-analog">

## create-analog

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

### Serving the application

To start the development server for the application, run the `start` command.

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm run start
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn start
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm run start
```

  </TabItem>
</Tabs>

Visit [http://localhost:5173](http://localhost:5173) in your browser to view the running application.

Next, you can [define additional routes using components](/docs/features/routing/overview) for navigation.

### Building the Application

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

### Build Artifacts

By default, Analog comes with [Server-Side Rendering](/docs/features/server/server-side-rendering) enabled.
Client artifacts are located in the `dist/analog/public` directory.
The server for the API/SSR build artifacts is located in the `dist/analog/server` directory.

  </TabItem>
</Tabs>

  </TabItem>

  <TabItem label="Nx" value="nx">

## Nx

Create a new Nx workspace with a preconfigured Analog application:

```shell
npx create-nx-workspace --preset=@analogjs/platform
```

The Analog preset prompts you to provide the name of your application. In this example, we simply use `analog-app`.
Additionally, asks whether you would like to include [TailwindCSS](https://tailwindcss.com) and [tRPC](https://trpc.io) in your new project.
If you choose to include either of them, all the required dependencies are installed automatically,
and any necessary configurations is added.

### Serving the application

To start the development server for your application, run the `nx serve` command.

```shell
nx serve analog-app
```

### Building the Application

To build the application for deployment run:

```shell
nx build analog-app
```

### Build Artifacts

The client build artifacts are located in the dist folder of your Nx workspace.

By default, Analog comes with [Server-Side Rendering](/docs/features/server/server-side-rendering) enabled.
In the common apps/libs workspace layout, the `analog-app`'s client artifacts are located in the `dist/apps/analog-app/analog/public` directory.
The server for the API/SSR build artifacts is located in the `dist/apps/analog-app/analog/server` directory.

</TabItem>
</Tabs>

## Upgrade your existing application

There are two methods for upgrading an Analog application. You have the option to utilize the `ng update @analogjs/platform` command
to Upgrade a standalone project, or you can make use of the Nx migrate command, which is `nx migrate @analogjs/platform`.

<Tabs groupId="app-upgrader">
  <TabItem label="ng update" value="ng-update">

### ng update

Upgrade an Analog project with the following `ng update` command:

```shell
ng update @analogjs/platform
```
</TabItem>

  <TabItem label="Nx" value="nx-migrate">

### Nx Migrate

Upgrade an Analog project with the following `nx migrate` command: 

```shell
nx migrate @analogjs/platform
```
</TabItem>
</Tabs>

