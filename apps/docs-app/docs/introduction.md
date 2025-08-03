---
id: introduction
sidebar_position: 1
slug: /
title: Introduction to Analog - The Fullstack Angular Meta-Framework
description: Learn about Analog, the powerful fullstack meta-framework for building applications and websites with Angular. Discover modern tooling, file-based routing, SSR/SSG, and more.
keywords:
  [
    'Analog',
    'Angular',
    'meta-framework',
    'fullstack',
    'SSR',
    'SSG',
    'file-based routing',
    'Vite',
    'TypeScript',
  ]
image: https://analogjs.org/img/analog-banner.png
url: https://analogjs.org/docs
type: documentation
author: Analog Team
publishedTime: '2022-01-01T00:00:00.000Z'
modifiedTime: '2024-01-01T00:00:00.000Z'
section: Introduction
tags: ['getting-started', 'overview', 'features']
---

# Introduction

Analog is a fullstack meta-framework for building applications and websites with [Angular](https://angular.dev).

Similar to other meta-frameworks such as Next.JS, Nuxt, SvelteKit, Qwik City, and others, Analog provides a similar experience, building on top of Angular.

## What is Analog?

Analog is a meta-framework that enhances Angular with modern development capabilities:

- **Modern Tooling**: Built on [Vite](https://vitejs.dev/) for lightning-fast development
- **Full-Stack**: Seamlessly integrate frontend and backend code
- **File-Based Routing**: Intuitive routing based on your file structure
- **Server-Side Rendering**: Built-in SSR/SSG capabilities powered by [Nitro](https://nitro.unjs.io)
- **Content-First**: Native support for Markdown and MDX content
- **API Routes**: Build backend APIs alongside your Angular app
- **Developer Experience**: Hot Module Replacement, TypeScript support, and more

## Core Features

### 🚀 Modern Development Stack

- **Vite**: Lightning-fast HMR and optimized builds
- **Vitest**: Unit testing with native Vite support
- **Playwright**: E2E testing framework
- **TypeScript**: First-class TypeScript support

### 📁 File-Based Routing

- [Automatic route generation](/docs/features/routing/overview) from your file structure
- [Route metadata](/docs/features/routing/metadata) for SEO and page configuration

### 🌐 Server-Side Capabilities

- [Server-side rendering (SSR)](/docs/features/server/server-side-rendering)
- [Static site generation (SSG)](/docs/features/server/static-site-generation)
- [Hybrid rendering modes](/docs/features/server/hybrid-rendering)
- [API routes](/docs/features/api/overview) with full HTTP method support
- [WebSocket support](/docs/features/api/websockets)

### 📝 Content Management

- [Markdown routes](/docs/features/routing/content) for documentation and blogs
- [MDX support](/docs/features/routing/content#mdx-support) for interactive content
- [Syntax highlighting](/docs/packages/content/shiki-highlighter) with Shiki
- [Content collections](/docs/features/routing/content#content-collections)

### 🔌 Integrations

- [Angular CLI](/docs/getting-started#angular-cli) support
- [Nx workspaces](/docs/integrations/nx) for monorepo development
- [Angular Material](/docs/integrations/angular-material) integration
- [Ionic Framework](/docs/integrations/ionic) support
- [Storybook](/docs/integrations/storybook) for component development
- [Astro](/docs/packages/astro-angular/overview) for using Angular components

## Quick Links

<div className="quick-links-grid">
  <a href="/docs/getting-started" className="quick-link-card">
    <div className="card-content">
      <h3>🚀 Getting Started</h3>
      <p>Create your first Analog application in minutes</p>
    </div>
  </a>
  
  <a href="/docs/features/routing/overview" className="quick-link-card">
    <div className="card-content">
      <h3>🛣️ Routing Guide</h3>
      <p>Learn about file-based routing and layouts</p>
    </div>
  </a>
  
  <a href="/docs/features/api/overview" className="quick-link-card">
    <div className="card-content">
      <h3>🔌 API Routes</h3>
      <p>Build backend APIs with Analog</p>
    </div>
  </a>
  
  <a href="/docs/features/deployment/overview" className="quick-link-card">
    <div className="card-content">
      <h3>🚢 Deployment</h3>
      <p>Deploy to production platforms</p>
    </div>
  </a>
</div>

## Why Analog?

### For Angular Developers

If you're already using Angular, Analog provides:

- Modern development experience with Vite
- Built-in SSR/SSG without complex configuration
- File-based routing similar to other meta-frameworks
- Seamless integration with existing Angular knowledge

### For Full-Stack Development

- Write frontend and backend code in the same project
- Share types between client and server
- Unified deployment process
- Built-in API route handling

### For Content Sites

- Native Markdown/MDX support
- Optimized static site generation
- SEO-friendly by default
- Fast page loads with Vite optimization

## Architecture Overview

```mermaid title="Analog Architecture Overview"
graph TB
    subgraph "Development"
        A[Vite Dev Server] --> B[Angular Application]
        A --> C[API Routes]
        A --> D[Content Routes]
    end

    subgraph "Build"
        E[Vite Build] --> F[Client Bundle]
        E --> G[Server Bundle]
        E --> H[Static Assets]
    end

    subgraph "Production"
        I[Nitro Server] --> J[SSR/SSG]
        I --> K[API Endpoints]
        I --> L[Static Files]
    end

    B --> E
    C --> E
    D --> E
    F --> I
    G --> I
    H --> I
```

## Community & Support

<div className="community-links">
  <a href="https://github.com/analogjs/analog" className="community-link">
    <span>⭐</span>
    <span>Star on GitHub</span>
  </a>
  
  <a href="https://chat.analogjs.org" className="community-link">
    <span>💬</span>
    <span>Join Discord</span>
  </a>
  
  <a href="https://twitter.com/analogjs" className="community-link">
    <span>🐦</span>
    <span>Follow on Twitter</span>
  </a>
  
  <a href="/docs/sponsoring" className="community-link">
    <span>❤️</span>
    <span>Become a Sponsor</span>
  </a>
</div>

## Next Steps

Ready to get started? Check out our [Getting Started Guide](/docs/getting-started) to create your first Analog application!
