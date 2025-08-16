---
sidebar_position: 4
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Deploying to Netlify

This guide covers deploying your Analog application to [Netlify](https://www.netlify.com).

## Prerequisites

- A Netlify account ([sign up free](https://app.netlify.com/signup))
- Your Analog app in a Git repository
- Netlify CLI (optional): Install with your preferred package manager

<Tabs groupId="package-manager">
  <TabItem value="npm">

```bash
npm i -g netlify-cli
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```bash
yarn global add netlify-cli
```

  </TabItem>

  <TabItem value="pnpm">

```bash
pnpm add -g netlify-cli
```

  </TabItem>

  <TabItem value="bun">

```bash
bun add -g netlify-cli
```

  </TabItem>
</Tabs>

## Quick Deploy

### Method 1: Git Integration

1. **Connect Repository**

   - Log in to [Netlify](https://app.netlify.com)
   - Click "Add new site" → "Import an existing project"
   - Choose your Git provider and repository

2. **Configure Build Settings**

   ```
   Base directory: /
   Build command: npm run build
   Publish directory: dist/analog/public
   Functions directory: dist/analog/server
   ```

3. **Deploy**
   - Click "Deploy site"
   - Netlify will build and deploy automatically

### Method 2: Netlify CLI

1. **Install CLI**

   ```bash
   npm i -g netlify-cli
   ```

2. **Build and Deploy**

   ```bash
   # Build your app
   npm run build

   # Deploy to Netlify
   netlify deploy --dir=dist/analog/public

   # Deploy to production
   netlify deploy --prod --dir=dist/analog/public
   ```

3. **Continuous Deployment**
   ```bash
   # Link to Git repository
   netlify init
   ```

## Configuration

### netlify.toml

Create a `netlify.toml` file in your project root:

```toml
[build]
  command = "npm run build"
  functions = "dist/analog/server"
  publish = "dist/analog/public"

[build.environment]
  NODE_VERSION = "18"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200

[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-XSS-Protection = "1; mode=block"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"

[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

### Build Configuration

For Analog with SSR support:

```toml
[build]
  command = "npm run build"
  functions = "netlify/functions"
  publish = "dist/analog/public"

[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"

[[plugins]]
  package = "@netlify/plugin-angular-universal"
```

## Environment Variables

### Setting Variables

1. **Via Netlify UI**:

   - Site settings → Environment variables
   - Add key-value pairs
   - Deploy contexts: All, Production, Deploy previews, Branch deploys

2. **Via netlify.toml**:

   ```toml
   [build.environment]
     API_ENDPOINT = "https://api.example.com"
     NODE_ENV = "production"
   ```

3. **Via CLI**:
   ```bash
   netlify env:set API_KEY "your-secret-key"
   ```

### Using Environment Variables

```ts
// Server-side
const apiKey = process.env['API_KEY'];

// Client-side (prefix with VITE_)
const publicUrl = import.meta.env['VITE_PUBLIC_URL'];
```

## Netlify Functions

### Creating Functions

Transform Analog API routes for Netlify Functions:

1. Create `netlify/functions/api.js`:

```js
import { createServer } from '@analogjs/router/server';

export const handler = async (event, context) => {
  const server = createServer();

  return server.handle({
    rawUrl: event.path,
    method: event.httpMethod,
    headers: event.headers,
    body: event.body,
  });
};
```

2. Configure in `netlify.toml`:

```toml
[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/api/:splat"
  status = 200
```

### Edge Functions

For better performance, use Netlify Edge Functions:

```ts
// netlify/edge-functions/hello.ts
import { Context } from '@netlify/edge-functions';

export default async (request: Request, context: Context) => {
  return new Response('Hello from the edge!');
};

export const config = { path: '/api/hello' };
```

## Forms Handling

Netlify provides built-in form handling:

```html
<!-- Add netlify attribute to forms -->
<form name="contact" method="POST" data-netlify="true">
  <input type="hidden" name="form-name" value="contact" />
  <input type="email" name="email" required />
  <textarea name="message" required></textarea>
  <button type="submit">Send</button>
</form>
```

For Angular reactive forms:

```ts
@Component({
  template: `
    <form [formGroup]="form" (ngSubmit)="onSubmit()">
      <input type="hidden" name="form-name" value="contact" />
      <input formControlName="email" type="email" />
      <textarea formControlName="message"></textarea>
      <button type="submit">Send</button>
    </form>
  `,
})
export class ContactComponent {
  form = this.fb.group({
    email: ['', Validators.required],
    message: ['', Validators.required],
  });

  async onSubmit() {
    const formData = new FormData();
    formData.append('form-name', 'contact');
    Object.keys(this.form.value).forEach((key) => {
      formData.append(key, this.form.value[key]);
    });

    await fetch('/', {
      method: 'POST',
      body: formData,
    });
  }
}
```

## Deploy Previews

### Branch Deploys

Every branch gets its own URL:

- Main branch: `your-site.netlify.app`
- Feature branch: `feature-branch--your-site.netlify.app`

### Pull Request Previews

Configure in `netlify.toml`:

```toml
[build]
  publish = "dist/analog/public"

[context.deploy-preview]
  command = "npm run build:preview"

[context.branch-deploy]
  command = "npm run build:staging"
```

## Custom Domains

### Adding a Domain

1. **Site settings** → **Domain management**
2. **Add custom domain**
3. Update DNS records:
   - **A Record**: `75.2.60.5`
   - **CNAME**: `[your-site].netlify.app`

### SSL Certificates

Netlify automatically provisions Let's Encrypt certificates.

## Performance Optimization

### Asset Optimization

```toml
[[plugins]]
  package = "netlify-plugin-image-optim"

[[headers]]
  for = "/assets/*"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"

[[headers]]
  for = "*.js"
  [headers.values]
    Cache-Control = "public, max-age=31536000, immutable"
```

### Prerendering

Configure prerendering in `vite.config.ts`:

```ts
export default defineConfig({
  plugins: [
    analog({
      prerender: {
        routes: [
          '/',
          '/about',
          '/products',
          // Add more routes
        ],
      },
    }),
  ],
});
```

## Analytics and Monitoring

### Netlify Analytics

Enable server-side analytics (paid feature):

1. Site settings → Analytics
2. Enable Analytics

### Custom Analytics

```ts
// app.component.ts
import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-root',
  template: `<router-outlet />`,
})
export class AppComponent implements OnInit {
  ngOnInit() {
    // Track page views
    if (typeof window !== 'undefined') {
      // Your analytics code
    }
  }
}
```

## Split Testing

Configure A/B tests in `netlify.toml`:

```toml
[[plugins]]
  package = "@netlify/plugin-split-testing"

[plugins.inputs]
  branches = ["main", "feature-v2"]
  split = 0.5
```

## Troubleshooting

### Build Failures

1. **Check build logs** in Netlify dashboard
2. **Clear cache**: "Clear cache and retry deploy"
3. **Verify Node version**:
   ```toml
   [build.environment]
     NODE_VERSION = "18"
   ```

### Function Errors

1. **Check function logs**: Functions tab
2. **Test locally**:
   ```bash
   netlify dev
   ```

### Routing Issues

Ensure SPA routing works:

```toml
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

## Security Headers

Add security headers in `netlify.toml`:

```toml
[[headers]]
  for = "/*"
  [headers.values]
    X-Frame-Options = "DENY"
    X-XSS-Protection = "1; mode=block"
    X-Content-Type-Options = "nosniff"
    Referrer-Policy = "strict-origin-when-cross-origin"
    Permissions-Policy = "camera=(), microphone=(), geolocation=()"
    Content-Security-Policy = "default-src 'self'; script-src 'self' 'unsafe-inline';"
```

## CI/CD with GitHub Actions

```yaml
name: Deploy to Netlify
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install dependencies
        run: npm ci

      - name: Build
        run: npm run build

      - name: Deploy to Netlify
        uses: netlify/actions/cli@master
        with:
          args: deploy --prod --dir=dist/analog/public
        env:
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_SITE_ID }}
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
```

## Cost Optimization

1. **Optimize build minutes**: Cache dependencies
2. **Use appropriate function memory**: Default is often sufficient
3. **Enable asset optimization**: Compress images and files
4. **Monitor bandwidth usage**: Check Analytics dashboard
5. **Use CDN caching**: Set proper cache headers

## Best Practices

1. **Use environment variables** for configuration
2. **Enable deploy previews** for testing
3. **Set up custom domains** early
4. **Configure security headers**
5. **Monitor build times** and optimize
6. **Use Netlify plugins** for additional features
7. **Test locally** with `netlify dev`

## Related Resources

- [Netlify Documentation](https://docs.netlify.com)
- [Deployment Overview](/docs/features/deployment/overview)
- [Netlify CLI Reference](https://cli.netlify.com)
- [Build Plugins](https://docs.netlify.com/integrations/build-plugins)
