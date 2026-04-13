---
sidebar_position: 4
---

# AI

Analog 文档站点会在站点根目录发布两个面向 AI 的索引文件：

- `https://analogjs.org/llms.txt`
- `https://analogjs.org/llms-full.txt`

这些文件让你可以更方便地把文档接入 AI 辅助工作流，而不必手动抓取整个站点。

## 两者有什么区别？

### `llms.txt`

`llms.txt` 是一个精简的文档索引。它包含页面标题、URL 和简短描述，方便助手或检索管线快速找到相关文档页面。

适合以下场景：

- 作为轻量级检索入口
- 为自定义 RAG 管线提供页面索引
- 快速把 Analog 文档提供给 AI 工具

### `llms-full.txt`

`llms-full.txt` 是完整版本。它会把文档页面的完整 Markdown 内容拼接成一个文本文件。

适合以下场景：

- 作为本地索引的单一文件输入
- 为长上下文提示提供更完整的资料
- 离线处理时不必逐页抓取文档

## Analog 如何生成这些文件

文档应用会在 `apps/docs-app/docusaurus.config.js` 中自动生成这两个文件。

在文档构建期间：

- `llms.txt` 基于当前文档路由记录生成
- `llms-full.txt` 通过拼接 `apps/docs-app/docs` 下的 Markdown 源文件生成

这意味着这些文件会和已发布的文档保持同步，而不需要额外的导出步骤。

## 示例工作流

### 让助手使用文档索引

当你的 AI 工具支持远程文档索引时，可以使用 `llms.txt`：

```text
Use https://analogjs.org/llms.txt as the primary AnalogJS documentation index.
```

### 构建本地检索语料

当你希望用单个文件做 embeddings 或本地搜索时，可以使用 `llms-full.txt`：

```shell
curl -O https://analogjs.org/llms-full.txt
```

### 与普通文档链接配合使用

面向 AI 的文件是对已发布文档界面的补充，而不是替代。需要可导航文档时，仍然应链接到规范文档页面；需要面向 AI 的摄取格式时，再使用 `llms` 文件。
