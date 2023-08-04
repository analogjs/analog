---
sidebar_position: 2
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Nx

## Overview

[Nx](https://nx.dev) is a smart, fast, extensible build system with first class monorepo support and powerful integrations.

Analog provides integration with Nx monorepos and workspaces through a workspace preset and an application generator. An Analog application can be created as a standalone project or added to an existing Nx workspace.

## Creating a Standalone Nx project

To scaffold a standalone Nx project, use the `create-nx-workspace` command with the `@analogjs/platform` preset.

Create a new Nx workspace with a preconfigured Analog application:

```shell
npx create-nx-workspace@latest --preset=@analogjs/platform
```

The Analog preset prompts you to provide the name of your application. In this example, we simply use `analog-app`.
Additionally, asks whether you would like to include [TailwindCSS](https://tailwindcss.com) and [tRPC](https://trpc.io) in your new project.
If you choose to include either of them, all the required dependencies are installed automatically,
and any necessary configurations is added.

### Serving the application

To start the development server for your application, run the `nx serve` command.

```shell
npx nx serve analog-app
```

Navigate to `http://localhost:4200` in your browser to see the application running.

### Building the Application

To build the application for deployment run:

```shell
npx nx build analog-app
```

### Build Artifacts

The client build artifacts are located in the dist folder of your Nx workspace.

In the standalone workspace layout, the `analog-app`'s client artifacts are located in the `dist/analog/public` directory.
The server for the API/SSR build artifacts is located in the `dist/analog/server` directory.

## Adding to an existing Nx workspace

An Analog application can be generated within an existing Nx workspace. To generate an application:

First, install the `@analogjs/platform` package:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @analogjs/platform --save-dev
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn add @analogjs/platform --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install @analogjs/platform --save-dev
```

  </TabItem>
</Tabs>

Next, use the application generator to scaffold a new application:

```shell
npx nx g @analogjs/platform:app analog-app
```

### Serving the application

To start the development server for your application, run the `nx serve` command.

```shell
npx nx serve analog-app
```

Navigate to `http://localhost:4200` in your browser to see the application running.

### Building the Application

To build the application for deployment run:

```shell
npx nx build analog-app
```

### Build Artifacts

The client build artifacts are located in the dist folder of your Nx workspace.

In the common apps/libs workspace layout, the `analog-app`'s client artifacts are located in the `dist/apps/analog-app/analog/public` directory.
The server for the API/SSR build artifacts is located in the `dist/apps/analog-app/analog/server` directory.

### Generators

The Analogjs Nx integration also provides a series of generators that help automate some of the frequent tasks inside an Nx Analog workspace, like generating a **Page**, a starting point for a **Blog** (work in progress), or generating **Posts** (work in progress). To use these generators, the **NxConsole** plugin can be installed or they can be invoked manually using:

### Generate a Page

This command will generate a page inside our `pages` folder with minimal configuration out of the box.

```shell
npx nx generate @analogjs/platform:page --pathname=index --project=analog-app
```

it also works with the Analog specific filenames, **Note: this names needs to be surrounded by single quotes** ex:

```shell
npx nx generate @analogjs/platform:page --pathname='(blog)' --project=analog-app
```

The schematic as well accepts subfolders to structure our project properly.

```shell
npx nx generate @analogjs/platform:page --pathname='products/[products]' --project=analog-app
```
