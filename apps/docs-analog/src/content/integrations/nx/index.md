# Nx

Analog provides integration with Nx monorepos and workspaces through a workspace preset and an application generator. An Analog application can be created as a standalone project or added to an existing Nx workspace.

## Overview

[Nx](https://nx.dev) is a smart, fast, extensible build system with first class monorepo support and powerful integrations.

## Creating a Standalone Nx project

To scaffold a standalone Nx project, use the `create-nx-workspace` command with the `@analogjs/platform` preset.

Create a new Nx workspace with a preconfigured Analog application:

```shell
npx create-nx-workspace@latest --preset=@analogjs/platform
```

The Analog preset prompts you to provide the name of your application. In this example, we simply use `analog-app`.
Additionally, asks whether you would like to include [TailwindCSS](https://tailwindcss.com) in your new project.
If you choose to include it, all the required dependencies are installed automatically,
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
npx nx g @analogjs/platform:application analog-app
```

### Generator Options

Both the preset and the application generator accept the following options:

| Option        | Description                                                                                          | Default  |
| ------------- | ---------------------------------------------------------------------------------------------------- | -------- |
| `addTailwind` | Adds [TailwindCSS](https://tailwindcss.com) and its configuration to the application.                | `false`  |
| `linter`      | The linter to set up for the application: `eslint`, `oxlint`, or `none`. `oxlint` requires Nx 23.2+. | `eslint` |
| `tags`        | Comma-separated Nx project tags, used with the `@nx/enforce-module-boundaries` lint rule.            |          |

To generate an application linted with [oxlint](https://oxc.rs/docs/guide/usage/linter) through the `@nx/oxlint` plugin:

```shell
npx nx g @analogjs/platform:application analog-app --linter=oxlint
```

## Updating Nx

Analog supports Nx 23.2 and newer inferred targets and migrations. Update the workspace with `nx migrate`, and run the migrations it generates:

```shell
npx nx migrate latest
npx nx migrate --run-migrations
```

Nx 23.2 adds the `--run-migration` flag to run a single migration by name, such as the `@nx/vitest` migration that replaces `__dirname` with `import.meta.dirname` in the `vite.config.ts` files:

```shell
npx nx migrate --run-migration update-23-2-0-use-import-meta-dirname
```

## Agent Context

Both the preset and the application generator scaffold `AGENTS.md` and `CLAUDE.md` files that point AI coding assistants at the framework conventions shipped in `node_modules/@analogjs/platform/AGENTS.md`.

The preset writes them at the workspace root, since the workspace is created for Analog. The application generator writes them in the application folder, such as `apps/analog-app`, so the guidance stays scoped to the Analog application in a workspace that may contain other projects. Existing `AGENTS.md` and `CLAUDE.md` files are never overwritten.
