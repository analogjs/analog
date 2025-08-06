---
sidebar_position: 1
title: Content Package - Markdown and Content Management in Analog
description: Learn about the @analogjs/content package for powerful content management in Analog. Features include Markdown processing, frontmatter support, syntax highlighting, and content collections.
keywords:
  [
    'content package',
    'markdown',
    'frontmatter',
    'syntax highlighting',
    'content collections',
    'PrismJS',
    'Shiki',
    'content management',
  ]
image: https://analogjs.org/img/analog-banner.png
url: https://analogjs.org/docs/packages/content/overview
type: documentation
author: Analog Team
publishedTime: '2022-01-01T00:00:00.000Z'
modifiedTime: '2024-01-01T00:00:00.000Z'
section: Packages
tags: ['content', 'markdown', 'frontmatter', 'collections']
---

# Content Package Overview

The `@analogjs/content` package provides powerful content management capabilities for Analog applications, including Markdown processing, frontmatter support, syntax highlighting, and content collections.

## Features

- 📝 **Markdown Processing**: Convert Markdown files to routes
- 🏷️ **Frontmatter Support**: YAML metadata for SEO and configuration
- 🎨 **Syntax Highlighting**: Code highlighting with PrismJS or Shiki
- 📚 **Content Collections**: Organize and query content programmatically
- 🔍 **Full-text Search**: Built-in search capabilities
- 📱 **Responsive Images**: Automatic image optimization
- 🎯 **Type Safety**: Full TypeScript support

## Quick Start

### Installation

```bash title="Install content package"
npm install @analogjs/content
```

### Basic Setup

```ts title="app.config.ts - Content package configuration"
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideContent, withMarkdownRenderer } from '@analogjs/content';

export const appConfig: ApplicationConfig = {
  providers: [
    // ... other providers
    provideContent(withMarkdownRenderer()),
  ],
};
```

### Create Your First Content Route

```md title="about.md - Example content route"
## <!-- src/app/pages/about.md -->

title: About Us
description: Learn more about our company
author: John Doe
date: 2024-01-15
tags: [company, about]

---

# About Our Company

Welcome to our amazing company! We specialize in building great software.

## Our Mission

To make the web a better place through innovative solutions.

[Back to Home](/)
```

## Content Processing

### Frontmatter

Frontmatter allows you to add metadata to your Markdown files:

```md title="blog-post.md - Frontmatter example"
---
title: My Blog Post
description: A brief description of the post
author: Jane Smith
date: 2024-01-15
tags: [angular, analog, tutorial]
category: tutorials
featured: true
image: /images/blog-post.jpg
---

# Blog Post Content

Your markdown content here...
```

### Supported Frontmatter Fields

| Field         | Type        | Description             |
| ------------- | ----------- | ----------------------- |
| `title`       | string      | Page title for SEO      |
| `description` | string      | Meta description        |
| `author`      | string      | Content author          |
| `date`        | string/Date | Publication date        |
| `tags`        | string[]    | Content tags            |
| `category`    | string      | Content category        |
| `featured`    | boolean     | Featured content flag   |
| `image`       | string      | Featured image URL      |
| `draft`       | boolean     | Draft status            |
| `layout`      | string      | Custom layout component |

### Meta Tags

Add custom meta tags for SEO:

```md
---
title: SEO Optimized Page
meta:
  - name: description
    content: This is a description for search engines
  - property: og:title
    content: Open Graph Title
  - property: og:description
    content: Open Graph Description
  - property: og:image
    content: /images/og-image.jpg
  - name: twitter:card
    content: summary_large_image
  - name: keywords
    content: angular, analog, tutorial, web development
---

# SEO Optimized Content

Your content here...
```

## Syntax Highlighting

### PrismJS Integration

Enable PrismJS for syntax highlighting:

```ts
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideContent, withMarkdownRenderer } from '@analogjs/content';
import { withPrismHighlighter } from '@analogjs/content/prism-highlighter';

export const appConfig: ApplicationConfig = {
  providers: [provideContent(withMarkdownRenderer(), withPrismHighlighter())],
};
```

Add PrismJS theme to your global styles:

```css
/* src/styles.css */
@import 'prismjs/themes/prism.css';
```

### Shiki Integration

For better syntax highlighting, use Shiki:

```ts
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideContent, withMarkdownRenderer } from '@analogjs/content';
import { withShikiHighlighter } from '@analogjs/content/shiki-highlighter';

export const appConfig: ApplicationConfig = {
  providers: [
    provideContent(
      withMarkdownRenderer(),
      withShikiHighlighter({
        theme: 'github-dark',
        langs: ['typescript', 'javascript', 'html', 'css', 'json'],
      }),
    ),
  ],
};
```

### Code Block Examples

````md
# Code Examples

## TypeScript

```typescript
interface User {
  id: number;
  name: string;
  email: string;
}

function getUser(id: number): Promise<User> {
  return fetch(`/api/users/${id}`).then((res) => res.json());
}
```
````

## JavaScript

```javascript
const user = {
  id: 1,
  name: 'John Doe',
  email: 'john@example.com',
};

console.log(user.name);
```

## HTML

```html
<div class="container">
  <h1>Hello World</h1>
  <p>Welcome to our site!</p>
</div>
```

## Diff Highlighting

```diff
+ // New code added
- // Old code removed
  // Unchanged code
```

## Content Collections

### Creating Collections

Organize your content into collections:

```ts
// src/app/content/blog.ts
import { defineCollection, z } from '@analogjs/content';

const blogCollection = defineCollection({
  schema: z.object({
    title: z.string(),
    description: z.string(),
    author: z.string(),
    date: z.date(),
    tags: z.array(z.string()),
    featured: z.boolean().optional(),
    image: z.string().optional(),
  }),
});

export default blogCollection;
```

### Using Collections in Components

```ts
// src/app/pages/blog/index.page.ts
import { Component, inject } from '@angular/core';
import { injectContent } from '@analogjs/content';
import { AsyncPipe, JsonPipe } from '@angular/common';

@Component({
  standalone: true,
  imports: [AsyncPipe, JsonPipe],
  template: `
    <div class="blog-list">
      @for (post of posts(); track post.slug) {
        <article class="blog-post">
          <h2>{{ post.attributes.title }}</h2>
          <p>{{ post.attributes.description }}</p>
          <div class="meta">
            <span>By {{ post.attributes.author }}</span>
            <span>{{ post.attributes.date | date }}</span>
          </div>
          <a [routerLink]="['/blog', post.slug]">Read More</a>
        </article>
      }
    </div>
  `,
})
export default class BlogListComponent {
  posts = injectContent('blog');
}
```

### Filtering and Sorting

```ts
// src/app/pages/blog/featured.page.ts
import { Component, inject } from '@angular/core';
import { injectContent } from '@analogjs/content';
import { map } from 'rxjs';

@Component({
  template: `
    <h1>Featured Posts</h1>
    @for (post of featuredPosts(); track post.slug) {
      <article>
        <h2>{{ post.attributes.title }}</h2>
        <p>{{ post.attributes.description }}</p>
      </article>
    }
  `,
})
export default class FeaturedPostsComponent {
  private allPosts = injectContent('blog');

  featuredPosts = this.allPosts.pipe(
    map((posts) => posts.filter((post) => post.attributes.featured)),
  );
}
```

## Advanced Features

### Custom Components in Markdown

Create custom components for use in Markdown:

```ts
// src/app/components/callout.component.ts
import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-callout',
  standalone: true,
  template: `
    <div class="callout" [class]="type">
      <div class="callout-icon">
        @if (type === 'warning') {
          ⚠️
        } @else if (type === 'error') {
          ❌
        } @else if (type === 'success') {
          ✅
        } @else {
          ℹ️
        }
      </div>
      <div class="callout-content">
        <ng-content />
      </div>
    </div>
  `,
  styles: [
    `
      .callout {
        display: flex;
        gap: 1rem;
        padding: 1rem;
        border-radius: 8px;
        margin: 1rem 0;
      }

      .warning {
        background: #fff3cd;
        border: 1px solid #ffeaa7;
        color: #856404;
      }

      .error {
        background: #f8d7da;
        border: 1px solid #f5c6cb;
        color: #721c24;
      }

      .success {
        background: #d4edda;
        border: 1px solid #c3e6cb;
        color: #155724;
      }

      .info {
        background: #d1ecf1;
        border: 1px solid #bee5eb;
        color: #0c5460;
      }
    `,
  ],
})
export class CalloutComponent {
  @Input() type: 'info' | 'warning' | 'error' | 'success' = 'info';
}
```

Register the component for use in Markdown:

```ts
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideContent, withMarkdownRenderer } from '@analogjs/content';
import { CalloutComponent } from './components/callout.component';

export const appConfig: ApplicationConfig = {
  providers: [
    provideContent(
      withMarkdownRenderer({
        components: {
          'app-callout': CalloutComponent,
        },
      }),
    ),
  ],
};
```

Use in Markdown:

```md
# Using Custom Components

<app-callout type="warning">
  This is a warning message that will be rendered as a custom component.
</app-callout>

<app-callout type="success">
  This is a success message with a green background.
</app-callout>
```

### Image Optimization

Configure image optimization:

```ts
// src/app/app.config.ts
import { ApplicationConfig } from '@angular/core';
import { provideContent, withMarkdownRenderer } from '@analogjs/content';

export const appConfig: ApplicationConfig = {
  providers: [
    provideContent(
      withMarkdownRenderer({
        image: {
          // Enable responsive images
          responsive: true,
          // Default image sizes
          sizes: [400, 800, 1200],
          // Image formats
          formats: ['webp', 'avif'],
          // Quality settings
          quality: 80,
        },
      }),
    ),
  ],
};
```

### Full-text Search

Enable search functionality:

```ts
// src/app/services/search.service.ts
import { Injectable, inject } from '@angular/core';
import { injectContent } from '@analogjs/content';
import { map } from 'rxjs';

interface SearchResult {
  title: string;
  description: string;
  url: string;
  excerpt: string;
}

@Injectable({
  providedIn: 'root',
})
export class SearchService {
  private blogPosts = injectContent('blog');

  search(query: string) {
    return this.blogPosts.pipe(
      map((posts) =>
        posts.filter(
          (post) =>
            post.attributes.title.toLowerCase().includes(query.toLowerCase()) ||
            post.attributes.description
              .toLowerCase()
              .includes(query.toLowerCase()) ||
            post.content.toLowerCase().includes(query.toLowerCase()),
        ),
      ),
      map((posts) =>
        posts.map((post) => ({
          title: post.attributes.title,
          description: post.attributes.description,
          url: `/blog/${post.slug}`,
          excerpt: this.getExcerpt(post.content, query),
        })),
      ),
    );
  }

  private getExcerpt(content: string, query: string): string {
    const index = content.toLowerCase().indexOf(query.toLowerCase());
    if (index === -1) return content.substring(0, 150) + '...';

    const start = Math.max(0, index - 75);
    const end = Math.min(content.length, index + 75);
    return '...' + content.substring(start, end) + '...';
  }
}
```

## Configuration Options

### Vite Configuration

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

export default defineConfig({
  plugins: [
    analog({
      content: {
        // Content directory
        contentDir: 'src/content',

        // Markdown options
        markdown: {
          // Enable GitHub-flavored markdown
          gfm: true,
          // Enable math expressions
          math: true,
          // Custom remark plugins
          remarkPlugins: [],
          // Custom rehype plugins
          rehypePlugins: [],
        },

        // Syntax highlighting
        prismOptions: {
          // Additional languages
          additionalLangs: ['prism-diff', 'prism-json'],
          // Custom themes
          themes: ['prism', 'prism-dark'],
        },

        // Image optimization
        image: {
          responsive: true,
          sizes: [400, 800, 1200],
          formats: ['webp', 'avif'],
        },
      },
    }),
  ],
});
```

## Best Practices

### 1. Content Organization

- Use consistent frontmatter structure
- Organize content into logical collections
- Use descriptive file names
- Keep content files focused and concise

### 2. Performance

- Optimize images for web
- Use appropriate syntax highlighting themes
- Implement proper caching strategies
- Lazy load heavy content

### 3. SEO

- Always include title and description
- Use proper meta tags
- Implement structured data
- Optimize for search engines

### 4. Accessibility

- Use semantic HTML in custom components
- Provide alt text for images
- Ensure proper color contrast
- Test with screen readers

## Related Documentation

- [Content Routes](/docs/features/routing/content)
- [Syntax Highlighting](#syntax-highlighting)
- [Content Collections](#content-collections)
- [Prism Highlighter](/docs/packages/content/prism-highlighter)
- [Shiki Highlighter](/docs/packages/content/shiki-highlighter)
