---
title: Introduction
description: What Analog is and why it exists.
---

Analog is the fullstack meta-framework for Angular. It uses Vite for fast dev
and Nitro for the server runtime, and gives you file-based routing, server
endpoints, and content-driven pages — all with idiomatic Angular at the core.

## Why Analog?

Angular is a great framework for building applications, but the developer
experience around tooling and server-side capabilities has historically
trailed other ecosystems. Analog closes that gap.

:::tip
Analog works seamlessly with existing Angular apps. You can adopt it
incrementally, one route at a time.
:::

## Quick example

```ts
import { Component } from '@angular/core';

@Component({
  template: `<h1>Hello, {{ name() }}!</h1>`,
})
export default class HomePage {
  readonly name = signal('Analog');
}
```
