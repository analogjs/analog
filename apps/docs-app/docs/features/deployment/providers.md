# Providers

Analog supports deployment to many providers with little or no additional configuration using [Nitro](https://nitro.unjs.io) as its underlying server engine. You can find more providers in the [Nitro deployment docs](https://nitro.unjs.io/deploy).

## Render.com

Analog supports deploying on [Render](https://render.com/) with minimal configuration.

1. [Create a new Web Service](https://dashboard.render.com/select-repo?type=web) and select the repository that contains your code.

2. Ensure the 'Node' environment is selected.

3. Depending on your package manager, set the build command to `yarn && yarn build`, `npm install && npm run build`, or `pnpm i --shamefully-hoist && pnpm build`.

4. Update the start command to `node dist/analog/server/index.mjs`

5. Click 'Advanced' and add an environment variable with `BUILD_PRESET` set to `render-com`.

6. Click 'Create Web Service'.

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
