---
sidebar_position: 3
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Deploying to Vercel

This guide walks you through deploying your Analog application to [Vercel](https://vercel.com).

## Prerequisites

- A Vercel account ([sign up free](https://vercel.com/signup))
- Your Analog app pushed to a Git repository (GitHub, GitLab, or Bitbucket)
- Vercel CLI (optional): Install with your preferred package manager

<Tabs groupId="package-manager">
  <TabItem value="npm">

```bash
npm i -g vercel
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```bash
yarn global add vercel
```

  </TabItem>

  <TabItem value="pnpm">

```bash
pnpm add -g vercel
```

  </TabItem>

  <TabItem value="bun">

```bash
bun add -g vercel
```

  </TabItem>
</Tabs>

## Deployment Methods

### Method 1: Git Integration (Recommended)

1. **Connect Your Repository**

   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "Add New Project"
   - Import your Git repository
   - Vercel will auto-detect the framework

2. **Configure Build Settings**

   Vercel should auto-detect Analog, but you can manually configure:

   - **Framework Preset**: `Other`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist/analog`
   - **Install Command**: `npm install`

3. **Environment Variables**

   Add any required environment variables:

   ```
   API_URL=https://api.example.com
   DATABASE_URL=postgresql://...
   ```

4. **Deploy**

   Click "Deploy" and Vercel will build and deploy your app.

### Method 2: Vercel CLI

1. **Install Vercel CLI**

   ```bash
   npm i -g vercel
   ```

2. **Build Your App**

   ```bash
   npm run build
   ```

3. **Deploy**

   ```bash
   vercel deploy dist/analog
   ```

4. **Production Deployment**
   ```bash
   vercel --prod
   ```

## Configuration

### vercel.json Configuration

Create a `vercel.json` file in your project root:

```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist/analog",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "framework": null,
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/api/index"
    }
  ],
  "functions": {
    "api/index.js": {
      "maxDuration": 60
    }
  }
}
```

### API Routes Configuration

For API routes to work properly with Vercel:

```json
{
  "functions": {
    "api/*.js": {
      "maxDuration": 10
    }
  },
  "rewrites": [
    {
      "source": "/api/(.*)",
      "destination": "/api/index"
    },
    {
      "source": "/(.*)",
      "destination": "/$1"
    }
  ]
}
```

## Environment Variables

### Setting Environment Variables

1. **Via Vercel Dashboard**:

   - Go to Project Settings → Environment Variables
   - Add your variables for Production, Preview, and Development

2. **Via Vercel CLI**:

   ```bash
   vercel env add API_URL production
   ```

3. **Using .env Files**:
   ```bash
   # .env.production
   API_URL=https://api.example.com
   DATABASE_URL=postgresql://...
   ```

### Accessing Environment Variables

In your Analog app:

```ts
// Server-side (API routes)
const apiUrl = process.env['API_URL'];

// Client-side (use Vite's env system)
const apiUrl = import.meta.env['VITE_API_URL'];
```

## Optimizations

### Edge Functions

For better performance, use Vercel Edge Functions:

```ts
// api/hello.edge.ts
export const config = {
  runtime: 'edge',
};

export default function handler(request: Request) {
  return new Response('Hello from the edge!');
}
```

### Image Optimization

Use Vercel's image optimization:

```html
<img src="/_vercel/image?url=/images/hero.jpg&w=1200&q=75" alt="Hero" />
```

### Caching Headers

Configure caching in your API routes:

```ts
// src/server/routes/api/data.ts
import { defineEventHandler, setHeader } from 'h3';

export default defineEventHandler((event) => {
  // Cache for 1 hour
  setHeader(event, 'Cache-Control', 's-maxage=3600, stale-while-revalidate');

  return { data: 'cached response' };
});
```

## Serverless Functions

### Function Configuration

Configure function settings in `vercel.json`:

```json
{
  "functions": {
    "api/heavy-task.js": {
      "maxDuration": 60,
      "memory": 3008
    }
  }
}
```

### Reducing Cold Starts

1. **Keep functions small**: Split large functions
2. **Use Edge Runtime**: When possible, use Edge Functions
3. **Optimize dependencies**: Only import what you need

```ts
// ❌ Bad - imports entire library
import _ from 'lodash';

// ✅ Good - imports only needed function
import debounce from 'lodash/debounce';
```

## Preview Deployments

Vercel creates preview deployments for every push:

1. **Branch Previews**: Each branch gets a unique URL
2. **PR Comments**: Automatic deployment links in PRs
3. **Preview Environment Variables**: Set different vars for previews

### Protecting Preview Deployments

Add password protection to preview deployments:

```json
{
  "github": {
    "enabled": true,
    "autoAlias": true
  },
  "passwordProtection": {
    "deploymentType": "preview"
  }
}
```

## Custom Domains

### Adding a Custom Domain

1. Go to Project Settings → Domains
2. Add your domain
3. Configure DNS:
   - **A Record**: `76.76.21.21`
   - **CNAME**: `cname.vercel-dns.com`

### SSL Certificates

Vercel automatically provisions SSL certificates for all domains.

## Monitoring and Analytics

### Vercel Analytics

Enable Web Analytics:

```ts
// app.component.ts
import { inject } from '@angular/core';
import { Analytics } from '@vercel/analytics/angular';

@Component({
  template: `<router-outlet />`,
})
export class AppComponent {
  analytics = inject(Analytics);
}
```

### Speed Insights

Monitor Core Web Vitals:

```bash
npm i @vercel/speed-insights
```

```ts
// main.ts
import { injectSpeedInsights } from '@vercel/speed-insights';

injectSpeedInsights();
```

## Troubleshooting

### Build Failures

1. **Check build logs** in Vercel dashboard
2. **Verify Node version**:

   ```json
   {
     "engines": {
       "node": "18.x"
     }
   }
   ```

3. **Clear cache**: Settings → Clear Build Cache

### 404 Errors

Ensure proper rewrites for SPA routing:

```json
{
  "rewrites": [{ "source": "/(.*)", "destination": "/" }]
}
```

### API Route Issues

1. **Check function logs**: Functions tab in dashboard
2. **Verify paths**: API routes should be in `api/` directory
3. **Test locally**: Use `vercel dev` to test

### Environment Variable Issues

- Ensure variables are set for the correct environment
- Rebuild after adding new variables
- Use different prefixes for client/server vars

## CI/CD Integration

### GitHub Actions

```yaml
name: Deploy to Vercel
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

      - name: Deploy to Vercel
        uses: vercel/action@v2
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
```

## Best Practices

1. **Use Environment Variables**: Never hardcode sensitive data
2. **Optimize Images**: Use Vercel's image optimization
3. **Enable Caching**: Set appropriate cache headers
4. **Monitor Performance**: Use Vercel Analytics
5. **Test Preview Deployments**: Before merging to production
6. **Use Serverless Functions**: For API routes
7. **Configure Redirects**: Handle URL changes gracefully

## Cost Optimization

1. **Optimize Function Duration**: Keep functions under 10 seconds
2. **Use Edge Functions**: Lower cost and better performance
3. **Enable Caching**: Reduce function invocations
4. **Compress Assets**: Reduce bandwidth usage
5. **Monitor Usage**: Check Analytics dashboard regularly

## Related Resources

- [Vercel Documentation](https://vercel.com/docs)
- [Deployment Overview](/docs/features/deployment/overview)
- [Environment Variables Guide](https://vercel.com/docs/concepts/projects/environment-variables)
- [Edge Functions](https://vercel.com/docs/concepts/functions/edge-functions)
