import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

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

| Flag         | Description                                                                        | Value type | Default value |
| ------------ | ---------------------------------------------------------------------------------- | ---------- | ------------- |
| &lt;name&gt; | Name of the project. Specify `.` to scaffold the project in the current directory. | string     |               |
| `--template` | Template preset.                                                                   | string     |               |

### Template presets

| Preset                   | Description                                    |
| ------------------------ | ---------------------------------------------- |
| `Full-stack Application` | Default Analog application.                    |
| `Blog`                   | Default template enhanced with a blog example. |

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
