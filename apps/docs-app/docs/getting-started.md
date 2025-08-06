---
sidebar_position: 2
title: Getting Started with Analog - Create Your First Application
description: Get started with Analog in minutes. Learn how to create your first Analog application, set up your development environment, and understand the core concepts.
keywords:
  [
    'getting started',
    'tutorial',
    'create analog',
    'setup',
    'installation',
    'first app',
    'quick start',
  ]
image: https://analogjs.org/img/analog-banner.png
url: https://analogjs.org/docs/getting-started
type: documentation
author: Analog Team
publishedTime: '2022-01-01T00:00:00.000Z'
modifiedTime: '2024-01-01T00:00:00.000Z'
section: Getting Started
tags: ['tutorial', 'setup', 'installation', 'quick-start']
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Getting Started

This guide will walk you through creating your first Analog application with detailed steps and explanations.

## Prerequisites Checklist

Before you begin, ensure you have the following installed:

### Required

- ✅ **Node.js**: v18.13.0 or higher ([Download Node.js](https://nodejs.org/))
- ✅ **Package Manager**: npm, yarn, pnpm, or bun
- ✅ **Angular**: v15 or higher (will be installed with Analog)

### Recommended

- 📝 **VS Code** or your preferred IDE
- 🔧 **Angular Language Service** extension for better IDE support
- 🚀 **Git** for version control

### Verify Your Setup

Check that your development environment is properly configured:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell title="Check Node.js and npm versions"
# Check Node.js version
node --version  # Should output v18.13.0 or higher

# Check npm version (comes with Node.js)
npm --version
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell title="Check Node.js and Yarn versions"
# Check Node.js version
node --version  # Should output v18.13.0 or higher

# Check Yarn version
yarn --version
```

  </TabItem>

  <TabItem value="pnpm">

```shell title="Check Node.js and pnpm versions"
# Check Node.js version
node --version  # Should output v18.13.0 or higher

# Check pnpm version
pnpm --version
```

  </TabItem>

  <TabItem value="bun">

```shell title="Check Node.js and Bun versions"
# Check Node.js version
node --version  # Should output v18.13.0 or higher

# Check Bun version
bun --version
```

  </TabItem>
</Tabs>

## Creating a New Application

### Quick Start

To create a new Analog project, use the `create-analog` package:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell title="Create Analog project with npm"
npm create analog@latest
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell title="Create Analog project with Yarn"
yarn create analog
```

  </TabItem>

  <TabItem value="pnpm">

```shell title="Create Analog project with pnpm"
pnpm create analog
```

  </TabItem>
  <TabItem value="bun">

```shell title="Create Analog project with Bun"
bun create analog
```

  </TabItem>
</Tabs>

### Interactive Setup

The CLI will guide you through the setup process:

```shell title="Interactive CLI setup"
? Project name: › my-analog-app
? Select a template: › (Use arrow keys)
❯ Angular Latest
  Minimal
  Blog

? Would you like to add Tailwind CSS? › (y/N)
? Would you like to add tRPC? › (y/N)
```

### Template Options

- **Angular Latest**: Full-featured template with routing, SSR, and examples
- **Minimal**: Bare-bones setup for starting from scratch
- **Blog**: Pre-configured blog with Markdown support

### Alternative: Nx Workspace

For enterprise applications or monorepos, you can [scaffold a new project with Nx](/docs/integrations/nx).

### Angular CLI

Analog is designed to work alongside the Angular ecosystem and provides compatibility with Angular CLI workflows. While Analog has its own optimized build system powered by Vite, it maintains compatibility with Angular CLI patterns and conventions.

#### Key Compatibility Features

- **📁 Project Structure**: Follows Angular CLI conventions for folder organization
- **🔧 Configuration**: Compatible with `angular.json` and `tsconfig.json` patterns
- **📦 Dependencies**: Works with Angular CLI-generated projects and libraries
- **🎯 Migration Path**: Easy migration from Angular CLI projects to Analog

#### Using with Existing Angular CLI Projects

If you have an existing Angular CLI project, you can gradually adopt Analog features:

```shell title="Add Analog to existing Angular project"
# Install Analog in your Angular CLI project
npm install @analogjs/platform

# Add Analog configuration to your build process
# Follow the migration guide for detailed steps
```

#### Angular CLI Commands Reference

While Analog uses its own development server, many Angular CLI patterns remain familiar:

| Angular CLI Command | Analog Equivalent             |
| ------------------- | ----------------------------- |
| `ng serve`          | `npm run start`               |
| `ng build`          | `npm run build`               |
| `ng generate`       | Use Analog file-based routing |
| `ng test`           | `npm run test`                |
| `ng lint`           | `npm run lint`                |

See the [migration guide](/docs/guides/migrating) for detailed instructions on transitioning from Angular CLI to Analog.

### Serving the application

To start the development server for the application, run the `start` command.

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell title="Start development server with npm"
npm run start
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell title="Start development server with Yarn"
yarn start
```

  </TabItem>

  <TabItem value="pnpm">

```shell title="Start development server with pnpm"
pnpm start
```

  </TabItem>
  <TabItem value="bun">

```shell title="Start development server with Bun"
bun start
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

```shell title="Build application with Yarn"
yarn build
```

  </TabItem>

  <TabItem value="pnpm">

```shell title="Build application with pnpm"
pnpm run build
```

  </TabItem>
  <TabItem value="bun">

```shell title="Build application with Bun"
bun run build
```

  </TabItem>
</Tabs>

### Build Artifacts

By default, Analog comes with [Server-Side Rendering](/docs/features/server/server-side-rendering) enabled.

**Output Structure:**

```text title="Build output structure"
dist/
└── analog/
    ├── public/          # Client-side assets
    │   ├── assets/      # Static assets
    │   └── index.html   # HTML template
    └── server/          # Server-side code
        ├── main.js      # Server entry point
        └── chunks/      # Server chunks

```

## Project Structure

After creating your Analog app, you'll have the following structure:

```text title="Project structure"
my-analog-app/
├── src/
│   ├── app/
│   │   ├── app.component.ts      # Root component
│   │   ├── app.config.ts         # App configuration
│   │   └── pages/                # File-based routes
│   │       ├── index.page.ts     # Home page (/)
│   │       └── about.page.ts     # About page (/about)
│   ├── server/
│   │   └── routes/               # API routes
│   │       └── api/
│   │           └── hello.ts      # Example API endpoint
│   ├── assets/                   # Static assets
│   ├── environments/             # Environment configs
│   ├── main.ts                   # Client entry point
│   └── main.server.ts            # Server entry point
├── public/                       # Public static files
├── index.html                    # HTML template
├── package.json                  # Dependencies
├── tsconfig.json                 # TypeScript config
├── vite.config.ts                # Vite configuration
└── README.md                     # Project documentation
```

### Key Files Explained

- **`vite.config.ts`**: Configures Vite and Analog plugins
- **`app.config.ts`**: Angular application configuration
- **`main.server.ts`**: Server-side rendering entry point
- **`pages/`**: Directory for file-based routing
- **`server/routes/`**: API routes and server endpoints

## Common Issues & Solutions

### Port Already in Use

If you see "Port 5173 is already in use":

<Tabs groupId="platform">
  <TabItem value="alternative" label="Use Different Port">

```shell title="Start with custom port"
npm run start -- --port 3000
```

  </TabItem>

  <TabItem value="macos-linux" label="macOS/Linux">

```shell title="Kill process on port 5173 (macOS/Linux)"
# Find and kill the process using port 5173
lsof -ti:5173 | xargs kill -9
```

  </TabItem>

  <TabItem value="windows" label="Windows">

```shell title="Kill process on port 5173 (Windows)"
# Find the process using port 5173
netstat -ano | findstr :5173

# Kill the process (replace <PID> with the actual process ID)
taskkill /PID <PID> /F
```

  </TabItem>
</Tabs>

### Module Resolution Errors

If you encounter module resolution issues:

1. Clear node_modules and reinstall:

   ```shell title="Clear and reinstall dependencies"
   rm -rf node_modules package-lock.json
   npm install
   ```

2. Ensure TypeScript paths are configured correctly in `tsconfig.json`

### Angular Version Mismatch

If you see Angular version warnings:

```shell title="Update Angular packages"
# Update Angular packages
npm update @angular/core @angular/common
```

## Next Steps

Now that your Analog app is running:

1. 📁 [Learn about file-based routing](/docs/features/routing/overview)
2. 🔌 [Create API endpoints](/docs/features/api/overview)
3. 📝 [Add Markdown content](/docs/features/routing/content)
4. 🚀 [Deploy your app](/docs/features/deployment/overview)

## Migrating an Existing Application

Have an existing Angular app? See the [migration guide](/docs/guides/migrating) for step-by-step migration instructions.
