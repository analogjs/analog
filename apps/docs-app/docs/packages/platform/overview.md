---
title: Platform Package - Core Analog Framework Services
description: Learn about the @analogjs/platform package that provides core platform functionality for Analog applications. Essential services, schematics, and utilities for the Analog ecosystem.
keywords:
  [
    'platform package',
    'core services',
    'schematics',
    'Angular ecosystem',
    'Analog framework',
    'project setup',
  ]
image: https://analogjs.org/img/analog-banner.png
url: https://analogjs.org/docs/packages/platform/overview
type: documentation
author: Analog Team
publishedTime: '2022-01-01T00:00:00.000Z'
modifiedTime: '2024-01-01T00:00:00.000Z'
section: Packages
tags: ['platform', 'core', 'services', 'schematics']
---

# Platform

The `@analogjs/platform` package provides core platform functionality for Analog applications.

## Overview

The platform package is a core component of Analog, the fullstack meta-framework for Angular. It provides essential platform services and utilities that are used throughout the Analog ecosystem.

## Installation

```bash
npm install @analogjs/platform
```

## Features

- Core platform services
- Schematics for project setup
- Platform-specific utilities
- Integration with Angular ecosystem

## Usage

The platform package is typically used internally by other Analog packages and provides the foundation for the Analog framework.

## Schematics

The platform package includes several schematics for setting up Analog projects:

### Setup Vitest

```bash
npx ng generate @analogjs/platform:setup-vitest --project [your-project-name]
```

This schematic installs Vitest and updates the test builder configuration.

## Learn More

For more information about Analog, visit [analogjs.org](https://analogjs.org).
