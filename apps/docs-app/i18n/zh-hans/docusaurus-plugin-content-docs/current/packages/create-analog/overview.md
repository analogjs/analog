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

| Preset        | Description                     |
| ------------- | ------------------------------- |
| `angular-v15` | Angular version 15 application. |
| `angular-v14` | Angular version 14 application. |

### Example

To scaffold an Angular version 15 application in the `my-angular-app` directory, run:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
# npm >=7.0
npm create analog@latest my-angular-app -- --template angular-v15
# npm 6.x
npm create analog@latest my-angular-app --template angular-v15
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn create analog my-angular-app --template angular-v15
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm create analog my-angular-app --template angular-v15
```

  </TabItem>
</Tabs>

### Using with Tailwind

当前的 Analog 模板默认使用 Vite 插件方式集成 Tailwind v4。生成的项目会使用 `@tailwindcss/vite`，在 `src/styles.css` 中添加 `@import 'tailwindcss';`，并且不会为标准配置额外生成 `.postcssrc.json` 或 `tailwind.config.*` 文件。

如果你不希望在生成的项目中包含 Tailwind，可以传入 `--skipTailwind true`。默认的 Tailwind v4 流程要求全局样式入口使用普通 CSS 文件。
