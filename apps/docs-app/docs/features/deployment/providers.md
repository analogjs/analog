# Providers

## Render.com

Analog supports deploying on [Render](https://render.com/) with minimal configuration.

1. [Create a new Web Service](https://dashboard.render.com/select-repo?type=web) and select the repository that contains your code.

2. Ensure the 'Node' environment is selected.

3. Depending on your package manager, set the build command to `yarn && yarn build`, `npm install && npm run build`, or `pnpm i --shamefully-hoist && pnpm build`.

4. Update the start command to `node dist/analog/server/index.mjs`

5. Click 'Advanced' and add an environment variable with `NITRO_PRESET` set to `render-com`.

6. Click 'Create Web Service'.

## Edgio

Analog supports deploying on [Edgio](https://edg.io) with minimal configuration.

1. Install the Edgio CLI:

```bash
npm i -g @edgio/cli
```

2. In your project's directory, initialize Edgio:

```bash
edgio init --connector=@edgio/analogjs --edgioVersion=6.1.4
```

3. Deploy To Edgio

```bash
edgio deploy
```
 
