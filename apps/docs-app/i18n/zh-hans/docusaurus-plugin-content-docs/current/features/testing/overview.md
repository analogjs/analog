import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 运行测试

Analog 支持用 [Vitest](https://vitest.dev) 来运行单元测试。

## Vitest 功能

Vitest 支持很多功能:

- A Jest-compatible API.
- 兼容 Jest 的 API。
- 支持 Vits 的配置，变换器，解析器和插件。
- 智能以及实施观察模式。
- TypeScript support.
- 支持 TypeScript。
- 兼容 Jest 的快照。
- 利用 jsdom 来 mock DOM。
- 源码内测试。
- 以及更多 ...

## 运行单元测试

要运行单元测试，使用 `test` 命令：

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

也可以在现有的项目里 [添加 Vitest](/docs/features/testing/vitest)。

## 已知的限制

- 只有全局变量使用了 Zone.js 进行修补。这意味着，如果你直接从 `vitest` 导入 `it`，`describe` 等，您将无法运行 `fakeAsync`。相反，请使用函数（`it`，`describe` 等。就像你以前在 Jest/Jasmine 中所作的那样 - 无需在测试文件中导入这些函数）。
- 使用了 `vmThreads`。这可能会导致潜在的内存泄露，并默认使用 JSDOM 提供更接近 Jest 的环境。你可以阅读 [这里](https://github.com/vitest-dev/vitest/issues/4685) 查看更多细节。

  如果要改变 - 调整你的 `vite.config.mts`

  ```typescript
  export default defineConfig(({ mode }) => {
    return {
      test: {
        pool: 'threads', // add this property
      },
    };
  });
  ```
