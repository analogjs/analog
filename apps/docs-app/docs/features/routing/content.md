import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Content Routes

Analog also supports using markdown content as routes, and rendering markdown content in components.

## Usage

To use content files in Analog, install the `@analogjs/content` package and its dependencies:

### Installation

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm install @analogjs/content prismjs marked front-matter
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn install @analogjs/content prismjs marked front-matter
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm install @analogjs/content prismjs marked front-matter
```

  </TabItem>
</Tabs>

### Setup

In the `main.ts`, add the `provideContent()` function, along with the `withMarkdownRenderer()` feature to the `providers` array when bootstrapping the application.

```ts
import 'zone.js';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideFileRouter } from '@analogjs/router';
import { provideContent, withMarkdownRenderer } from '@analogjs/content';

import { AppComponent } from './app/app.component';

bootstrapApplication(AppComponent, {
  providers: [provideFileRouter(), provideContent(withMarkdownRenderer())],
});
```

If you are using SSR, add it to the `main.server.ts` file also.

```ts
import 'zone.js/node';
import { enableProdMode } from '@angular/core';
import { renderApplication } from '@angular/platform-server';
import { provideFileRouter } from '@analogjs/router';
import { withEnabledBlockingInitialNavigation } from '@angular/router';
import { provideContent, withMarkdownRenderer } from '@analogjs/content';

import { AppComponent } from './app/app.component';

if (import.meta.env.PROD) {
  enableProdMode();
}

export default async function render(url: string, document: string) {
  const html = await renderApplication(AppComponent, {
    appId: 'analog-app',
    document,
    url,
    providers: [
      provideFileRouter(withEnabledBlockingInitialNavigation()),
      provideContent(withMarkdownRenderer()),
    ],
  });

  return html;
}
```

## Defining Content Routes

Content routes include support for frontmatter, metatags, and syntax highlighting with PrismJS.

The example route below in `src/app/routes/about.md` defines an `/about` route.

```md
---
title: About
meta:
  - name: description
    content: About Page Description
  - property: og:title
    content: About
---

## About Analog

Analog is a meta-framework for Angular.

[Back Home](./)
```

## Defining Content Files

For more flexibility, markdown content files can be provided in the `src/content` folder. Here you can list markdown files such as blog posts.

```md
---
title: My First Post
slug: 2022-12-27-my-first-post
description: My First Post Description
coverImage: https://images.unsplash.com/photo-1493612276216-ee3925520721?ixlib=rb-4.0.3&ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&auto=format&fit=crop&w=464&q=80
---

Hello World
```

## Using the Content Files List

To get a list using the list of content files in the `src/content` folder, use the `injectContentFiles()` function from the `@analogjs/content` package in your component.

```ts
import { Component } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { injectContentFiles } from '@analogjs/content';
import { NgFor } from '@angular/common';

export interface PostAttributes {
  title: string;
  slug: string;
  description: string;
  coverImage: string;
}

@Component({
  standalone: true,
  imports: [RouterOutlet, RouterLink, NgFor],
  template: `
    <ul *ngFor="let post of posts">
      <li>
        <a [routerLink]="['/blog', 'posts', post.attributes.slug]">
          {{ post.attributes.title }}</a
        >
      </li>
    </ul>
  `,
})
export default class BlogComponent {
  readonly posts = injectContentFiles<PostAttributes>();
}
```

## Using the Analog Markdown Component

Analog provides a `MarkdownComponent` and `injectContent()` function for rendering markdown content with frontmatter.

The `injectContent()` function uses the `slug` route parameter by default to get the content file from the `src/content` folder.

```ts
// /src/app/routes/blog/posts.[slug].ts
import { injectContent, MarkdownComponent } from '@analogjs/content';
import { AsyncPipe, NgIf } from '@angular/common';
import { Component } from '@angular/core';

export interface PostAttributes {
  title: string;
  slug: string;
  description: string;
  coverImage: string;
}

@Component({
  standalone: true,
  imports: [MarkdownComponent, AsyncPipe, NgIf],
  template: `
    <ng-container *ngIf="post$ | async as post">
      <h1>{{ post.attributes.title }}</h1>
      <analog-markdown [content]="post.content"></analog-markdown>
    </ng-container>
  `,
})
export default class BlogPostComponent {
  readonly post$ = injectContent<PostAttributes>();
}
```
