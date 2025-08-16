# @analogjs/trpc

Angular/Nitro-based tRPC integration for Analog.

## Features

- Full tRPC v11 support
- Angular integration with RxJS observables
- Server-side rendering (SSR) support
- Transfer state for hydration
- Type-safe API calls

## Installation

```bash
npm install @analogjs/trpc @trpc/client@^11.0.0 @trpc/server@^11.0.0
```

## Usage

### Client Setup

```typescript
// trpc-client.ts
import { AppRouter } from './server/trpc/routers';
import { createTrpcClient } from '@analogjs/trpc';
import { inject } from '@angular/core';
import superjson from 'superjson';

export const { provideTrpcClient, TrpcClient, TrpcHeaders } =
  createTrpcClient<AppRouter>({
    url: '/api/trpc',
    options: {
      transformer: superjson, // Optional: transformers are now handled via links
    },
  });

export function injectTrpcClient() {
  return inject(TrpcClient);
}
```

### Server Setup

```typescript
// server/trpc/routers/index.ts
import { router } from '../trpc';
import { noteRouter } from './notes';

export const appRouter = router({
  note: noteRouter,
});

export type AppRouter = typeof appRouter;
```

### Component Usage

```typescript
// my-component.ts
import { Component } from '@angular/core';
import { injectTrpcClient } from './trpc-client';

@Component({
  selector: 'app-my-component',
  template: `
    @if (hello$ | async; as hello) {
      {{ hello.greeting }}
    }
  `,
})
export class MyComponent {
  private trpc = injectTrpcClient();
  hello$ = this.trpc.hello.query({ name: 'Analog' });
}
```

## tRPC v11 Migration

This package now supports tRPC v11. The main changes include:

- Transformers are now handled via links instead of the `transformer` option
- Backward compatibility is maintained for existing transformer usage
- Updated peer dependencies to require tRPC v11

### Breaking Changes

- `@trpc/client` and `@trpc/server` must be version 11.0.0 or higher
- Transformers are now processed through links (backward compatible)

## API Reference

### `createTrpcClient<TRouter>(options)`

Creates a tRPC client with Angular integration.

#### Options

- `url`: The base URL for tRPC API calls
- `options.transformer`: (Deprecated) Use transformer link instead
- `options.links`: Additional tRPC links
- `batchLinkOptions`: Options for the HTTP batch link

#### Returns

- `TrpcClient`: Injection token for the tRPC client
- `provideTrpcClient`: Provider function for Angular DI
- `TrpcHeaders`: Signal for managing HTTP headers

## License

MIT
