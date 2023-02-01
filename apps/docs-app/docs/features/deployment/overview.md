# Deployment

## Building the Application

To build the application for deployment

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm run build
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn build
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm run build
```

  </TabItem>
</Tabs>

## Build Artifacts

The client build artifacts are located in the `dist/client` directory. The server for the API/SSR build artifacts are located in the `dist/server` directory.

If you have [server side rendering](/docs/features/server/server-side-rendering) enabled, the client build artifacts are located in the `dist/server/public` directory. The server for the API/SSR build artifacts are located in the `dist/server/server` directory.
