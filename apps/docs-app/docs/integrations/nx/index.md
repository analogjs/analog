---
sidebar_position: 2
title: Nx Integration with Analog - Monorepo Development Guide
description: Learn how to integrate Analog with Nx monorepos and workspaces. Create standalone Nx projects, add Analog to existing workspaces, and leverage Nx's powerful build system.
keywords:
  [
    'Nx',
    'monorepo',
    'workspace',
    'build system',
    'generators',
    'presets',
    'analog platform',
  ]
image: https://analogjs.org/img/analog-banner.png
url: https://analogjs.org/docs/integrations/nx
type: documentation
author: Analog Team
publishedTime: '2022-01-01T00:00:00.000Z'
modifiedTime: '2024-01-01T00:00:00.000Z'
section: Integrations
tags: ['nx', 'monorepo', 'workspace', 'build']
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Nx

Analog provides integration with Nx monorepos and workspaces through a workspace preset and an application generator. An Analog application can be created as a standalone project or added to an existing Nx workspace.

## Overview

[Nx](https://nx.dev) is a smart, fast, extensible build system with first class monorepo support and powerful integrations.

## Creating a Standalone Nx project

To scaffold a standalone Nx project, use the `create-nx-workspace` command with the `@analogjs/platform` preset.

Create a new Nx workspace with a preconfigured Analog application:

```shell title="Create Nx workspace with Analog preset"
npx create-nx-workspace@latest --preset=@analogjs/platform
```

The Analog preset prompts you to provide the name of your application. In this example, we simply use `analog-app`.
Additionally, asks whether you would like to include [TailwindCSS](https://tailwindcss.com) and [tRPC](https://trpc.io) in your new project.
If you choose to include either of them, all the required dependencies are installed automatically,
and any necessary configurations is added.

### Serving the application

To start the development server for your application, run the `nx serve` command.

```shell title="Serve Analog application in Nx workspace"
npx nx serve analog-app
```

Navigate to `http://localhost:4200` in your browser to see the application running.

### Building the Application

To build the application for deployment run:

```shell title="Build Analog application in Nx workspace"
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

```shell title="Install Analog platform package with npm"
npm install @analogjs/platform --save-dev
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell title="Install Analog platform package with Yarn"
yarn add @analogjs/platform --dev
```

  </TabItem>

  <TabItem value="pnpm">

```shell title="Install Analog platform package with pnpm"
pnpm install @analogjs/platform --save-dev
```

  </TabItem>
</Tabs>

Next, use the application generator to scaffold a new application:

```shell
npx nx g @analogjs/platform:application analog-app
```
