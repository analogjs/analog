import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 运行测试

Analog 支持使用 [Vitest](https://vitest.dev) 运行单元测试。

## Vitest 功能

Vitest 支持许多功能：

- 兼容 Jest 的 API。
- 支持 Vite 的配置、转换器、解析器和插件。
- 智能且即时的监视模式。
- 支持 TypeScript。
- 兼容 Jest 的快照。
- 用于 DOM 模拟的 jsdom。
- 源码内测试。
- 以及更多……

您也可以将 [Vitest 添加](/docs/features/testing/vitest) 到现有的项目中。

## Angular 对 Vitest 的支持

在 Angular v21 中，针对新 Angular 项目引入了通过 Angular CLI 对 Vitest 的直接稳定支持。虽然 Analog 和 Angular 都支持使用 Vitest 运行测试，但两者之间既有一些相似之处，也存在关键差异。

下表展示了这两种选择所支持的功能。

| Vitest               | Analog    | Angular      |
| -------------------- | --------- | ------------ |
| Angular 版本         | v17+      | v21+         |
| 支持方               | 社区      | Angular 团队 |
| 构建器 (Builders)    | ✅        | ✅           |
| 原理图 (Schematics)  | ✅        | ✅           |
| 迁移 (Migrations)    | ✅        | ✅           |
| 浏览器模式           | ✅        | ✅           |
| 完全可配置           | ✅        | ⚠️           |
| Vitest CLI           | ✅        | ❌           |
| Vitest 工作区        | ✅        | ❌           |
| 自定义环境           | ✅        | ❌           |
| 自定义提供者         | ✅        | ❌           |
| IDE 扩展             | ✅        | ❌           |
| 可构建库             | ✅        | ❌           |
| 模块模拟/图          | ✅        | ❌           |
| 类型                 | ✅        | ❌           |

上表并非用于比较这两种解决方案，而是提供每种实现所支持功能的详细信息。请选择最符合您需求和优先级的解决方案。

## 运行单元测试

要运行单元测试，请使用 `test` 命令：

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm run test
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn test
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm run test
```

  </TabItem>
</Tabs>

## IDE 支持

测试也可以使用适用于 VS Code 或 JetBrains IDE 的 Vitest [IDE 集成](https://vitest.dev/guide/ide) 直接从 IDE 运行。

## 已知限制

- Zone.js 仅修补了全局变量。这意味着，如果您直接从 `vitest` 导入 `it`、`describe` 等，您将无法运行 `fakeAsync`。相反，请使用这些函数（`it`、`describe` 等，就像您在 Jest/Jasmine 中使用的方式一样——不要在测试文件中导入这些函数）。
- 使用了 `vmThreads`。这可能会导致潜在的内存泄漏，默认使用它是为了提供更接近带有 JSDOM 的 Jest 环境。更多详情您可以阅读 [这里](https://github.com/vitest-dev/vitest/issues/4685)。

  要更改此设置——请调整您的 `vite.config.mts`：

  ```typescript
  export default defineConfig(({ mode }) => {
    return {
      test: {
        pool: 'threads', // 添加此属性
      },
    };
  });
  ```
