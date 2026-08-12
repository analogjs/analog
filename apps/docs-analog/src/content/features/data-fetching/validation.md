# Schema Validation

Analog supports runtime validation of server-side data using [Standard Schema](https://standardschema.dev/) — a vendor-neutral interface implemented by Zod, Valibot, ArkType, and other schema libraries. Bring your own schema library; Analog just works.

## Setup

Install any Standard Schema-compatible library. For example, with Valibot:

```bash
npm install valibot
```

No additional Analog configuration is required. The `@standard-schema/spec` types are included as an optional peer dependency of `@analogjs/router` and `@analogjs/content`.

## Validating Server Actions

Use `defineAction()` to automatically validate the request body before your handler runs. You can also validate route params with a separate `params` schema. On validation failure, it returns a `422` response with structured error issues.

Form submissions with repeated field names are preserved as arrays. Single occurrences stay scalar values, while repeated keys become arrays. This makes checkbox groups, multi-select inputs, and repeated form keys safe to validate with schema libraries.

### Defining the Action

```ts
// src/app/pages/newsletter.server.ts
import { defineAction, json } from '@analogjs/router/server/actions';
import * as v from 'valibot';

const NewsletterSchema = v.object({
  email: v.pipe(v.string(), v.email()),
  name: v.pipe(v.string(), v.minLength(1)),
});

export const action = defineAction({
  schema: NewsletterSchema,
  handler: async ({ data, event }) => {
    // `data` is fully typed as { email: string; name: string }
    await subscribeToNewsletter(data.email, data.name);
    return json({ success: true });
  },
});
```

When the request body fails validation, `defineAction` returns `fail(422, issues)` automatically with `StandardSchemaV1.Issue[]` — no manual validation needed.

### Validating Route Params

```ts
// src/app/pages/users/[id].server.ts
import { defineAction, json } from '@analogjs/router/server/actions';
import * as v from 'valibot';

export const action = defineAction({
  schema: v.object({
    name: v.pipe(v.string(), v.minLength(1)),
  }),
  params: v.object({
    id: v.pipe(
      v.string(),
      v.transform((value) => Number(value)),
    ),
  }),
  handler: async ({ data, params }) => {
    await updateUser(params.id, data.name);
    return json({ success: true });
  },
});
```

### Handling Validation Errors in the Component

The `FormAction` directive receives validation errors through the `onError` event. With `defineAction`, errors are always a structured array of issues. You can map them to field names with `issuesToFieldErrors()` from `@analogjs/router` if you want a form-friendly shape in the component:

```ts
// src/app/pages/newsletter.page.ts
import { Component, signal } from '@angular/core';
import { FormAction } from '@analogjs/router';

interface ValidationIssue {
  message: string;
  path?: (string | { key: string })[];
}

@Component({
  imports: [FormAction],
  template: `
    <h3>Newsletter Signup</h3>

    <form
      method="post"
      (onSuccess)="success.set(true)"
      (onError)="errors.set($any($event))"
    >
      <div>
        <label for="email">Email</label>
        <input type="email" name="email" />
      </div>

      <div>
        <label for="name">Name</label>
        <input type="text" name="name" />
      </div>

      <button type="submit">Subscribe</button>

      @for (error of errors(); track error.message) {
        <p class="error">{{ error.message }}</p>
      }
    </form>

    @if (success()) {
      <p>Thanks for signing up!</p>
    }
  `,
})
export default class NewsletterComponent {
  success = signal(false);
  errors = signal<ValidationIssue[]>([]);
}
```

### Using with the Existing Pattern

`defineAction` is fully compatible with the existing `PageServerAction` pattern. You can use both in the same project — existing actions without schemas continue to work without changes.

```ts
import * as v from 'valibot';

// Existing pattern — still works
export async function action({ event }: PageServerAction) {
  const body = await event.request.formData();
  const email = body.get('email') as string;
  if (!email) return fail(422, { email: 'Email is required' });
  return json({ success: true });
}

// New pattern — same result, less code, full type safety
export const action = defineAction({
  schema: v.object({
    email: v.pipe(v.string(), v.email()),
  }),
  handler: async ({ data }) => {
    return json({ success: true });
  },
});
```

## Validating API Routes

Use `defineApiRoute()` to validate both input and output of API routes. For simple cases, `input` validates the primary request payload. For more control, you can validate `params`, `query`, and `body` separately.

```ts
// src/server/routes/api/v1/users.post.ts
import { defineApiRoute } from '@analogjs/router/server/actions';
import * as v from 'valibot';

const CreateUserInput = v.object({
  name: v.pipe(v.string(), v.minLength(1)),
  email: v.pipe(v.string(), v.email()),
  role: v.picklist(['admin', 'user']),
});

const CreateUserOutput = v.object({
  id: v.string(),
  name: v.string(),
  email: v.string(),
});

export default defineApiRoute({
  input: CreateUserInput,
  output: CreateUserOutput,
  handler: async ({ data }) => {
    // `data` is typed as { name: string; email: string; role: 'admin' | 'user' }
    const user = await db.users.create(data);
    return user;
  },
});
```

`defineApiRoute()` also supports returning a raw `Response`. Plain objects are automatically serialized as JSON, while `Response` objects are passed through unchanged so you can set custom headers, redirects, streams, and status codes when needed.

### Input Validation

- **POST/PUT/PATCH**: Validates the request body (JSON or FormData)
- **GET/HEAD**: Validates query parameters

Repeated query params and repeated form fields are preserved as arrays instead of being collapsed to the last value. Single occurrences stay scalar values. For example, `?tag=angular&tag=analog` validates as `{ tag: ['angular', 'analog'] }`, while `?tag=angular` validates as `{ tag: 'angular' }`.

Uploaded files follow the same rule: a single file field is a `File`, and repeated file fields become `File[]`.

On validation failure, returns `422` with `StandardSchemaV1.Issue[]` and the `X-Analog-Errors` header.

### Output Validation

Output validation runs in **development mode only** — it logs a console warning when the response doesn't match the output schema. In production, output validation is completely skipped for zero overhead.

When your handler returns a raw `Response`, output validation is skipped. This keeps `Response` passthrough predictable and avoids consuming streamed, binary, redirected, or otherwise custom response bodies during validation.

### GET Route with Query Validation

```ts
// src/server/routes/api/v1/search.get.ts
import { defineApiRoute } from '@analogjs/router/server/actions';
import * as v from 'valibot';

const SearchInput = v.object({
  q: v.pipe(v.string(), v.minLength(1)),
  page: v.optional(
    v.pipe(
      v.string(),
      v.transform((value) => Number(value)),
      v.integer(),
      v.minValue(1),
    ),
    1,
  ),
});

export default defineApiRoute({
  input: SearchInput,
  handler: async ({ data }) => {
    // data.q is string, data.page is number (coerced from query string)
    const results = await search(data.q, data.page);
    return { results, page: data.page };
  },
});
```

### Route Params and Body Validation

```ts
// src/server/routes/api/v1/users/[id].put.ts
import { defineApiRoute } from '@analogjs/router/server/actions';
import * as v from 'valibot';

export default defineApiRoute({
  params: v.object({
    id: v.pipe(
      v.string(),
      v.transform((value) => Number(value)),
    ),
  }),
  body: v.object({
    name: v.pipe(v.string(), v.minLength(1)),
  }),
  handler: async ({ params, body }) => {
    return updateUser(params.id, body.name);
  },
});
```

When you provide explicit `query` or `body` schemas, the validated values are also available on `data` for backwards-compatible handler code. Existing routes that use `input` continue to work unchanged.

### Returning a Raw Response

```ts
// src/server/routes/api/v1/download.get.ts
import { defineApiRoute } from '@analogjs/router/server/actions';

export default defineApiRoute({
  handler: async () => {
    return new Response('report ready', {
      status: 202,
      headers: {
        'x-report-status': 'queued',
      },
    });
  },
});
```

## Validating Content Frontmatter

Use a schema with `parseRawContentFile()` to validate markdown frontmatter at parse time.

### Defining a Content Schema

```ts
// src/content/blog.schema.ts
import * as v from 'valibot';

export const BlogPostSchema = v.object({
  title: v.string(),
  date: v.pipe(v.string(), v.isoDate()),
  draft: v.optional(v.boolean(), false),
  tags: v.array(v.string()),
  coverImage: v.optional(v.pipe(v.string(), v.url())),
});
```

### Using with `contentFileResource`

```ts
// src/app/pages/blog/posts.[slug].page.ts
import { Component } from '@angular/core';
import { contentFileResource } from '@analogjs/content/resources';
import { BlogPostSchema } from '../../../content/blog.schema';

@Component({
  template: `
    @if (post.value(); as post) {
      <h1>{{ post.attributes.title }}</h1>
      <time>{{ post.attributes.date }}</time>
      <analog-markdown [content]="post.content"></analog-markdown>
    }
  `,
})
export default class BlogPostComponent {
  // Attributes are typed from the schema
  readonly post = contentFileResource({
    schema: BlogPostSchema,
  });
}
```

When a content file has invalid frontmatter, a `FrontmatterValidationError` is thrown with a clear message. `contentFileResource()` automatically includes the relative content filename in the error:

```text
"blog/my-post.md" frontmatter validation failed:
  - Required at "tags"
  - Invalid date at "date"
```

### Direct Usage

```ts
import { parseRawContentFile } from '@analogjs/content';
import { BlogPostSchema } from './blog.schema';

// Without schema — returns untyped attributes (existing behavior)
const { content, attributes } = parseRawContentFile(rawMarkdown);

// With schema — validates and returns typed attributes
const { content, attributes } = parseRawContentFile(
  rawMarkdown,
  BlogPostSchema,
);
// attributes is typed as { title: string; date: string; draft: boolean; tags: string[]; coverImage?: string }
```

If you want filename-aware errors when parsing directly, pass the filename as the third argument:

```ts
const result = parseRawContentFile(
  rawMarkdown,
  BlogPostSchema,
  'blog/my-post.md',
);
```

For schemas that require async validation, use `parseRawContentFileAsync()`. `contentFileResource()` handles both sync and async Standard Schema validators automatically:

```ts
import { parseRawContentFileAsync } from '@analogjs/content';

const result = await parseRawContentFileAsync(
  rawMarkdown,
  AsyncSchema,
  'blog/my-post.md',
);
```

## Using Different Schema Libraries

Standard Schema is library-agnostic. Here are examples with different libraries:

### Zod

```ts
import { z } from 'zod';

const Schema = z.object({
  email: z.string().email(),
  age: z.number().min(18),
});
```

### Valibot

```ts
import * as v from 'valibot';

const Schema = v.object({
  email: v.pipe(v.string(), v.email()),
  age: v.pipe(v.number(), v.minValue(18)),
});
```

### ArkType

```ts
import { type } from 'arktype';

const Schema = type({
  email: 'string.email',
  age: 'number >= 18',
});
```

All three work identically with `defineAction`, `defineApiRoute`, and `parseRawContentFile`.

## Error Format

All validation errors follow the `StandardSchemaV1.Issue` format:

```ts
interface Issue {
  message: string;
  path?: (string | { key: string })[];
}
```

Server-side validation (`defineAction`, `defineApiRoute`) returns errors through the existing `fail()` mechanism with the `X-Analog-Errors` response header. Content validation throws a `FrontmatterValidationError` with the issues array available on the `issues` property.
