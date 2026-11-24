# create-analog

The `create-analog` package contains templates for scaffolding new Analog projects.

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm create analog@latest
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn create analog
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm create analog
```

  </TabItem>
</Tabs>

### Optional `create-analog` flags

| Flag         | Description                                                                                          | Value type | Default value |
| ------------ | ---------------------------------------------------------------------------------------------------- | ---------- | ------------- |
| &lt;name&gt; | Name of the project. Specify `.` to scaffold the project in the current directory.                   | string     |               |
| `--template` | Template preset.                                                                                     | string     |               |
| `--server`   | Server for the `Full-stack Application` preset: `nitro` or `nestjs`. Other presets always use Nitro. | string     | `nitro`       |

### Template presets

| Preset                   | Description                                    |
| ------------------------ | ---------------------------------------------- |
| `Full-stack Application` | Default Analog application.                    |
| `Blog`                   | Default template enhanced with a blog example. |

### Tailwind v4

`create-analog` scaffolds Tailwind v4 for the current Analog templates. Generated projects import Tailwind in `src/styles.css` and wire the Tailwind-related Vite config the template expects.

If you only need Tailwind utilities in templates and global styles, keep the scaffold defaults.

If you also want `@apply` inside Angular component styles, add a `@reference` to your root stylesheet in those component stylesheets and follow the [Tailwind CSS guide](/docs/integrations/tailwind).

If you do not want Tailwind in the generated app, pass `--skipTailwind true`. The default Tailwind v4 flow expects a plain CSS entry file for global styles.

### NestJS server

Pass `--server nestjs` to serve the `Full-stack Application` preset from [NestJS](/docs/integrations/nestjs) instead of Nitro:

```shell
npm create analog@latest my-app -- --template latest --server nestjs
```

The project mounts Analog in a NestJS module with the Express adapter, and replaces the Nitro API route with a NestJS controller at `/api/v1/hello`. Build it with `npm run build` and start it with `npm run preview`. Prerendering, static site generation and deployment presets come from Nitro, so they aren't available with NestJS.

### Example

To scaffold an Angular application in the `my-angular-app` directory, run:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
# npm >=7.0
npm create analog@latest my-angular-app -- --template latest
# npm 6.x
npm create analog@latest my-angular-app -- --template blog
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn create analog my-angular-app --template blog
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm create analog my-angular-app --template blog
```

  </TabItem>
</Tabs>
