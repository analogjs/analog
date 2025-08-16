---
title: API Routes in Analog - Build Full-Stack Applications
description: Learn how to build powerful API routes with Analog using Nitro and h3. Create REST APIs, handle HTTP methods, implement middleware, and build full-stack applications.
keywords:
  [
    'API routes',
    'REST API',
    'backend',
    'server-side',
    'Nitro',
    'h3',
    'HTTP methods',
    'middleware',
  ]
image: https://analogjs.org/img/analog-banner.png
url: https://analogjs.org/docs/features/api/overview
type: documentation
author: Analog Team
publishedTime: '2022-01-01T00:00:00.000Z'
modifiedTime: '2024-01-01T00:00:00.000Z'
section: API Routes
tags: ['api', 'backend', 'server', 'rest']
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# API Routes

Analog provides a powerful API route system powered by [Nitro](https://nitro.unjs.io) and [h3](https://h3.unjs.io), enabling you to build full-stack applications with Angular.

## Overview

API routes in Analog are:

- **File-based**: Automatically mapped based on file structure
- **Full-featured**: Support all HTTP methods, middleware, and utilities
- **Type-safe**: Full TypeScript support
- **Fast**: Powered by the high-performance h3 framework

## Getting Started

### Basic API Route

API routes are defined in the `src/server/routes/api` folder and are exposed under the `/api` prefix:

```ts title="hello.ts - Basic API route example"
// src/server/routes/api/hello.ts
import { defineEventHandler } from 'h3';

export default defineEventHandler(() => {
  return {
    message: 'Hello from Analog API!',
    timestamp: new Date().toISOString(),
  };
});
```

This creates an endpoint at `/api/hello` that returns JSON data.

### Route File Naming

```text title="API route file structure"
src/server/routes/
├── api/
│   ├── hello.ts              → /api/hello
│   ├── users/
│   │   ├── index.ts          → /api/users
│   │   ├── [id].ts           → /api/users/:id
│   │   └── [id].delete.ts    → DELETE /api/users/:id
│   └── posts/
│       ├── [...slug].ts      → /api/posts/** (catch-all)
│       └── index.post.ts     → POST /api/posts
```

## Defining XML Content

To create an RSS feed for your site, set the `content-type` to be `text/xml` and Analog serves up the correct content type for the route.

```ts title="rss.xml.ts - XML content API route"
//server/routes/api/rss.xml.ts

import { defineEventHandler, setHeader } from 'h3';
export default defineEventHandler((event) => {
  const feedString = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
</rss>
  `;
  setHeader(event, 'content-type', 'text/xml');
  return feedString;
});
```

**Note:** For SSG content, set Analog to prerender an API route to make it available as prerendered content:

```ts title="vite.config.ts - Prerender API routes"
// vite.config.ts
...
prerender: {
  routes: async () => {
    return [
      ...
      '/api/rss.xml',
      ...
      .
    ];
  },
  sitemap: {
    host: 'https://analog-blog.netlify.app',
  },
},
```

The XML is available as a static XML document at `/dist/analog/public/api/rss.xml`

## Dynamic API Routes

Dynamic API routes are defined by using the filename as the route path enclosed in square brackets. Parameters can be accessed via `event.context.params`.

```ts
// /server/routes/api/v1/hello/[name].ts
import { defineEventHandler } from 'h3';

export default defineEventHandler(
  (event) => `Hello ${event.context.params?.['name']}!`,
);
```

Another way to access route parameters is by using the `getRouterParam` function.

```ts
// /server/routes/api/v1/hello/[name].ts
import { defineEventHandler, getRouterParam } from 'h3';

export default defineEventHandler((event) => {
  const name = getRouterParam(event, 'name');
  return `Hello, ${name}!`;
});
```

## HTTP Methods

Analog supports all HTTP methods through file naming conventions:

<Tabs groupId="http-methods">
  <TabItem value="get" label="GET">

```ts
// src/server/routes/api/users/[id].get.ts
import { defineEventHandler, getRouterParam } from 'h3';

interface User {
  id: string;
  name: string;
  email: string;
}

export default defineEventHandler(async (event): Promise<User> => {
  const id = getRouterParam(event, 'id');

  // Fetch user from database
  const user = await getUserById(id);

  if (!user) {
    throw createError({
      statusCode: 404,
      statusMessage: 'User not found',
    });
  }

  return user;
});
```

  </TabItem>

  <TabItem value="post" label="POST">

```ts
// src/server/routes/api/users.post.ts
import { defineEventHandler, readBody } from 'h3';
import { z } from 'zod';

// Define validation schema
const CreateUserSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

export default defineEventHandler(async (event) => {
  // Parse and validate request body
  const body = await readBody(event);

  try {
    const validatedData = CreateUserSchema.parse(body);

    // Create user in database
    const newUser = await createUser(validatedData);

    // Return created user (without password)
    return {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Validation failed',
        data: error.errors,
      });
    }
    throw error;
  }
});
```

  </TabItem>

  <TabItem value="put" label="PUT">

```ts
// src/server/routes/api/users/[id].put.ts
import { defineEventHandler, getRouterParam, readBody } from 'h3';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  const updates = await readBody(event);

  const updatedUser = await updateUser(id, updates);

  return {
    message: 'User updated successfully',
    user: updatedUser,
  };
});
```

  </TabItem>

  <TabItem value="delete" label="DELETE">

```ts
// src/server/routes/api/users/[id].delete.ts
import { defineEventHandler, getRouterParam } from 'h3';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');

  await deleteUser(id);

  // Return 204 No Content
  return null;
});
```

  </TabItem>

  <TabItem value="patch" label="PATCH">

```ts
// src/server/routes/api/users/[id].patch.ts
import { defineEventHandler, getRouterParam, readBody } from 'h3';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');
  const partialUpdates = await readBody(event);

  const patchedUser = await patchUser(id, partialUpdates);

  return patchedUser;
});
```

  </TabItem>
</Tabs>

## Requests with Query Parameters

Sample query `/api/v1/query?param1=Analog&param2=Angular`

```ts
// routes/api/v1/query.ts
import { defineEventHandler, getQuery } from 'h3';

export default defineEventHandler((event) => {
  const { param1, param2 } = getQuery(event);
  return `Hello, ${param1} and ${param2}!`;
});
```

## Catch-all Routes

Catch-all routes are helpful for fallback route handling.

```ts
// routes/api/[...].ts
export default defineEventHandler((event) => `Default page`);
```

## Error Handling

Proper error handling is crucial for building robust APIs. Analog provides several ways to handle errors:

### Basic Error Handling

```ts
// src/server/routes/api/users/[id].ts
import { defineEventHandler, getRouterParam, createError } from 'h3';

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id');

  // Validate input
  if (!id || !id.match(/^[0-9]+$/)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid user ID format',
    });
  }

  try {
    const user = await fetchUserById(id);

    if (!user) {
      throw createError({
        statusCode: 404,
        statusMessage: 'User not found',
      });
    }

    return user;
  } catch (error) {
    // Re-throw if it's already an h3 error
    if (error.statusCode) {
      throw error;
    }

    // Handle unexpected errors
    console.error('Database error:', error);
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal server error',
    });
  }
});
```

### Global Error Handler

```ts
// src/server/middleware/error-handler.ts
import { defineEventHandler } from 'h3';

export default defineEventHandler(async (event) => {
  try {
    // Continue with the request
    await event.next();
  } catch (error) {
    // Log errors
    console.error(`[${event.method}] ${event.path}:`, error);

    // Send error response
    if (error.statusCode) {
      setResponseStatus(event, error.statusCode);
      return {
        error: error.statusMessage || 'An error occurred',
      };
    }

    // Generic error response
    setResponseStatus(event, 500);
    return {
      error: 'Internal server error',
    };
  }
});
```

### Custom Error Classes

```ts
// src/server/utils/errors.ts
export class ValidationError extends Error {
  statusCode = 400;
  data: any;

  constructor(message: string, data?: any) {
    super(message);
    this.data = data;
  }
}

export class AuthenticationError extends Error {
  statusCode = 401;

  constructor(message = 'Authentication required') {
    super(message);
  }
}

export class AuthorizationError extends Error {
  statusCode = 403;

  constructor(message = 'Access denied') {
    super(message);
  }
}

// Usage in API route
import { ValidationError } from '~/server/utils/errors';

export default defineEventHandler(async (event) => {
  const body = await readBody(event);

  if (!body.email) {
    throw new ValidationError('Email is required', {
      field: 'email',
      code: 'REQUIRED',
    });
  }

  // ...
});
```

## Accessing Cookies

Analog allows setting and reading cookies in your server-side calls.

### Setting cookies

```ts
//(home).server.ts
import { setCookie } from 'h3';
import { PageServerLoad } from '@analogjs/router';

import { Product } from '../products';

export const load = async ({ fetch, event }: PageServerLoad) => {
  setCookie(event, 'products', 'loaded'); // setting the cookie
  const products = await fetch<Product[]>('/api/v1/products');

  return {
    products: products,
  };
};
```

### Reading cookies

```ts
//index.server.ts
import { parseCookies } from 'h3';
import { PageServerLoad } from '@analogjs/router';

export const load = async ({ event }: PageServerLoad) => {
  const cookies = parseCookies(event);

  console.log('products cookie', cookies['products']);

  return {
    shipping: true,
  };
};
```

## Middleware

Middleware allows you to run code before your API routes are executed:

### Route-specific Middleware

```ts
// src/server/middleware/auth.ts
import { defineEventHandler, getCookie, createError } from 'h3';

export default defineEventHandler(async (event) => {
  // Only apply to API routes
  if (!event.path.startsWith('/api/')) {
    return;
  }

  // Skip auth for public routes
  const publicRoutes = ['/api/login', '/api/register'];
  if (publicRoutes.includes(event.path)) {
    return;
  }

  // Check authentication
  const token = getCookie(event, 'auth-token');

  if (!token) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Authentication required',
    });
  }

  // Verify token and add user to context
  const user = await verifyToken(token);
  event.context.user = user;
});
```

### CORS Middleware

```ts
// src/server/middleware/cors.ts
import { defineEventHandler, handleCors } from 'h3';

export default defineEventHandler(async (event) => {
  // Handle CORS
  const corsResult = handleCors(event, {
    origin: process.env['ALLOWED_ORIGINS']?.split(',') || '*',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowHeaders: ['Content-Type', 'Authorization'],
  });

  if (corsResult) {
    return corsResult;
  }
});
```

## Advanced Features

### File Uploads

```ts
// src/server/routes/api/upload.post.ts
import { defineEventHandler, readMultipartFormData } from 'h3';
import { writeFile } from 'fs/promises';
import { join } from 'path';

export default defineEventHandler(async (event) => {
  const formData = await readMultipartFormData(event);

  if (!formData) {
    throw createError({
      statusCode: 400,
      statusMessage: 'No file uploaded',
    });
  }

  const file = formData.find((part) => part.name === 'file');

  if (!file || !file.filename) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid file',
    });
  }

  // Save file
  const filePath = join('uploads', file.filename);
  await writeFile(filePath, file.data);

  return {
    message: 'File uploaded successfully',
    filename: file.filename,
    size: file.data.length,
  };
});
```

### Server-Sent Events (SSE)

```ts
// src/server/routes/api/events.ts
import { defineEventHandler, createEventStream } from 'h3';

export default defineEventHandler(async (event) => {
  const eventStream = createEventStream(event);

  // Send initial event
  await eventStream.push({
    data: JSON.stringify({ message: 'Connected' }),
  });

  // Send periodic updates
  const interval = setInterval(async () => {
    await eventStream.push({
      event: 'update',
      data: JSON.stringify({
        timestamp: new Date().toISOString(),
        value: Math.random(),
      }),
    });
  }, 1000);

  // Cleanup on disconnect
  eventStream.onClosed(() => {
    clearInterval(interval);
  });

  return eventStream.send();
});
```

### Rate Limiting

```ts
// src/server/middleware/rate-limit.ts
import { defineEventHandler, createError } from 'h3';

const requestCounts = new Map();
const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 100;

export default defineEventHandler(async (event) => {
  if (!event.path.startsWith('/api/')) return;

  const clientIp = getClientIP(event) || 'unknown';
  const now = Date.now();

  // Clean old entries
  for (const [key, data] of requestCounts.entries()) {
    if (now - data.windowStart > WINDOW_MS) {
      requestCounts.delete(key);
    }
  }

  // Check rate limit
  const clientData = requestCounts.get(clientIp);

  if (clientData) {
    if (now - clientData.windowStart < WINDOW_MS) {
      clientData.count++;

      if (clientData.count > MAX_REQUESTS) {
        throw createError({
          statusCode: 429,
          statusMessage: 'Too many requests',
        });
      }
    } else {
      // Reset window
      clientData.windowStart = now;
      clientData.count = 1;
    }
  } else {
    requestCounts.set(clientIp, {
      windowStart: now,
      count: 1,
    });
  }
});
```

## Best Practices

### 1. Type Safety

Always use TypeScript interfaces for your API responses:

```ts
// src/server/types/api.ts
export interface ApiResponse<T> {
  data?: T;
  error?: string;
  meta?: {
    page?: number;
    total?: number;
  };
}

// Usage
import type { ApiResponse } from '~/server/types/api';

export default defineEventHandler(async (): Promise<ApiResponse<User[]>> => {
  const users = await getUsers();

  return {
    data: users,
    meta: {
      total: users.length,
    },
  };
});
```

### 2. Environment Variables

```ts
// src/server/utils/config.ts
export const config = {
  database: {
    url: process.env['DATABASE_URL'] || 'postgresql://localhost/myapp',
    poolSize: parseInt(process.env['DB_POOL_SIZE'] || '10'),
  },
  jwt: {
    secret: process.env['JWT_SECRET'] || 'development-secret',
    expiresIn: process.env['JWT_EXPIRES_IN'] || '7d',
  },
  api: {
    rateLimit: parseInt(process.env['API_RATE_LIMIT'] || '100'),
  },
};
```

### 3. Request Validation

```ts
// src/server/utils/validate.ts
import { z } from 'zod';
import { createError } from 'h3';

export async function validateBody<T>(
  event: any,
  schema: z.ZodSchema<T>,
): Promise<T> {
  const body = await readBody(event);

  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw createError({
        statusCode: 400,
        statusMessage: 'Validation failed',
        data: error.errors,
      });
    }
    throw error;
  }
}

// Usage
const CreatePostSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1),
  tags: z.array(z.string()).optional(),
});

export default defineEventHandler(async (event) => {
  const data = await validateBody(event, CreatePostSchema);
  // data is fully typed and validated
  return await createPost(data);
});
```

## Testing API Routes

```ts
// src/server/routes/api/__tests__/users.test.ts
import { describe, it, expect } from 'vitest';
import { $fetch } from '@nuxt/test-utils';

describe('Users API', () => {
  it('should return user list', async () => {
    const users = await $fetch('/api/users');

    expect(users).toBeInstanceOf(Array);
    expect(users[0]).toHaveProperty('id');
    expect(users[0]).toHaveProperty('name');
  });

  it('should create a new user', async () => {
    const newUser = {
      name: 'Test User',
      email: 'test@example.com',
    };

    const created = await $fetch('/api/users', {
      method: 'POST',
      body: newUser,
    });

    expect(created.name).toBe(newUser.name);
    expect(created.email).toBe(newUser.email);
    expect(created).toHaveProperty('id');
  });

  it('should handle validation errors', async () => {
    try {
      await $fetch('/api/users', {
        method: 'POST',
        body: { name: '' }, // Invalid data
      });
    } catch (error) {
      expect(error.response.status).toBe(400);
      expect(error.data).toHaveProperty('error');
    }
  });
});
```

## More Resources

- [Nitro Documentation](https://nitro.unjs.io/guide/routing) - Learn more about the server engine
- [h3 Documentation](https://h3.unjs.io/) - Explore all available utilities
- [API Examples](https://github.com/analogjs/analog/tree/main/apps/analog-app/src/server) - See real examples in the Analog repository
