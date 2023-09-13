import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Providers

Analog supports deployment to many providers with little or no additional configuration using [Nitro](https://nitro.unjs.io) as its underlying server engine. You can find more providers in the [Nitro deployment docs](https://nitro.unjs.io/deploy).

## Render.com

Analog supports deploying on [Render](https://render.com/) with minimal configuration.

### Web Service Deployment

1. [Create a new Web Service](https://dashboard.render.com/select-repo?type=web) and select the repository that contains your code.

2. Ensure the 'Node' environment is selected.

3. [Specify your Node version for Render to use](https://render.com/docs/node-version) (v18.13.0 or higher recommended) - Render by default uses Node 14, which fails to correctly build an Analog site

4. Depending on your package manager, set the build command to `yarn && yarn build`, `npm install && npm run build`, or `pnpm i --shamefully-hoist && pnpm build`.

5. Update the start command to `node dist/analog/server/index.mjs`

6. Click 'Advanced' and add an environment variable with `BUILD_PRESET` set to `render-com`.

7. Click 'Create Web Service'.

### Static Site Deployment

If using Analog to pre-render static content, you can deploy a static site on Render with minimal configuration

1. [Create a new Static Site](https://dashboard.render.com/select-repo?type=static) and select the repository that contains your code.

2. Depending on your package manager, set the build command to `yarn && yarn build`, `npm install && npm run build`, or `pnpm i --shamefully-hoist && pnpm build`..

3. Set the publish directory to the `public` directory inside of the `dist` build directory (e.g. `dist/analog/public`)

4. Click 'Create Static Site'

## Edgio

Analog supports deploying on [Edgio](https://edg.io) with minimal configuration.

1. Install the Edgio CLI:

```bash
npm i -g @edgio/cli
```

2. In your project's directory, initialize Edgio:

```bash
edgio init --connector=@edgio/analogjs
```

3. Deploy To Edgio

```bash
edgio deploy
```

## Firebase

Analog supports [Firebase Hosting](https://firebase.google.com/docs/hosting) with Cloud Functions out of the box.

See a [Sample Repo](https://github.com/brandonroberts/analog-angular-firebase-example) with Firebase configured

**Note**: You need to be on the **Blaze plan** to use Analog with Cloud Functions.

If you don't already have a `firebase.json` in your root directory, Analog will create one the first time you run it. In this file, you will need to replace `<your_project_id>` with the ID of your Firebase project.

This file should then be committed to version control. You can also create a `.firebaserc` file if you don't want to manually pass your project ID to your `firebase` commands (with `--project <your_project_id>`):

```json [.firebaserc]
{
  "projects": {
    "default": "<your_project_id>"
  }
}
```

Then, just add Firebase dependencies to your project:

```bash
npm install -D firebase-admin firebase-functions firebase-functions-test
```

### Using Firebase CLI

If prefer to set up your project with the Firebase CLI, which will fetch your project ID for you, add required dependencies (see above) and even set up automated deployments with GitHub Actions.

#### Install Firebase CLI globally

```bash
npm install -g firebase-tools
```

**Note**: You need to be on [^11.18.0](https://github.com/firebase/firebase-tools/releases/tag/v11.18.0) to deploy a nodejs18 function.

#### Initialize your Firebase project

```bash
firebase login
firebase init hosting
```

When prompted, enter `dist/analog/public` as the `public` directory.

In the next step, **do not** configure your project as a single-page app.

After setup completes, add the following to your `firebase.json` to enable server rendering in Cloud Functions:

```json [firebase.json]
{
  "functions": { "source": "dist/analog/server" },
  "hosting": [
    {
      "site": "<your_project_id>",
      "public": "dist/analog/public",
      "cleanUrls": true,
      "rewrites": [{ "source": "**", "function": "server" }]
    }
  ]
}
```

You can find more details in the [Firebase documentation](https://firebase.google.com/docs/hosting/quickstart).

### Local preview

You can preview a local version of your site to test things out without deploying.

```bash
BUILD_PRESET=firebase npm run build
firebase emulators:start
```

### Deploy to Firebase Hosting using the CLI

To deploy to Firebase Hosting, run the `firebase deploy` command.

```bash
BUILD_PRESET=firebase npm run build
firebase deploy
```

## Vercel

Analog supports deploying on [Vercel](https://vercel.com/) with no additional configuration.

### Deploying the Project

<Tabs groupId="porject-type">
  <TabItem label="Create analog" value="npm">
By default, when deploying to Vercel, the build preset is handled automatically.

1. Create a new project and select the repository that contains your code.

2. Click 'Deploy'.

And that's it!

  </TabItem>

  <TabItem label="Nx" value="yarn">
In order to make it work with Nx, we need to define the specific app we want to build. There are several ways to do this, and you can choose one of the following methods (replace &#60;app&#62; with your app name):

1. Define the `defaultProject` in your `nx.json`

```json [nx.json]
{
  "defaultProject": "<app>"
}
```

2. Create a `vercel.json` file in the root of your project and define the `buildCommand`:

```json [vercel.json]
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "nx build <app>"
}
```

3. Define the `buildCommand` in your `package.json`:

```json [package.json]
{
  "scripts": {
    "build": "nx build <app>"
  }
}
```

  </TabItem>
</Tabs>

### Setting the Preset Manually

There might be a case where Vercel doesn't load the preset automatically. In that case, you can do one of the following.

- Set the `BUILD_PRESET` environment variable to `vercel`.
- Set the preset in the `vite.config.ts` file:

```ts [vite.config.ts]
plugins: [
  analog({
    nitro: {
      preset: 'vercel',
    },
  }),
];
```

#### Nx and Vercel

When using Nx and reusing the build cache on the Vercel build platform, there is a possibility that the cache is reused if you have built it locally. This can lead to the output being placed in the wrong location. To resolve this issue, you can use the preset in the `vite.config.ts` file as a workaround.

## Netlify

Analog supports deploying on [Netlify](https://netlify.com/) with minimal configuration.

For the Netlify site, set the `Publish directory` to `dist/analog/public` and configure the output as below. This deploys the static assets, and the server as a Netlify function.


```ts [vite.config.ts]
plugins: [
  analog({
    nitro: {
      output: {
        serverDir: '{{ rootDir }}/.netlify/functions-internal',
        publicDir: '../../dist/analog/public',
      },
    },
  }),
];
```
