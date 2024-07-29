import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 服务器供应商

Analog 使用 [Nitro](https://nitro.unjs.io) 作为其底层服务器引擎，支持部署到许多服务器供应商，几乎无需额外配置。您可以在 [Nitro 部署文档](https://nitro.unjs.io/deploy) 中找到更多服务器供应商。

## Netlify

Analog 仅需少许配置即可部署到 [Netlify](https://netlify.com/)。

### 部署项目

<Tabs groupId="porject-type">
  <TabItem label="Create analog" value="create-analog">
在你的Netily项目里，设置 [publish directory](https://docs.netlify.com/configure-builds/overview/#definitions) 为 `dist/analog/public` 来部署静态资源，设置 [functions directory](https://docs.netlify.com/configure-builds/overview/#definitions) 为 `dist/analog` 来部署服务端。
  </TabItem>

  <TabItem label="Nx" value="nx">
在你的Netlify项目的界面的构建配置上，执行以下操作：
1. 设置 [build command](https://docs.netlify.com/configure-builds/overview/#definitions) 为 `nx build [your-project-name]`
2. 设置 [publish directory](https://docs.netlify.com/configure-builds/overview/#definitions) 为 `dist/[your-project-name]/analog/public` 来部署静态资源。
3. 设置 [functions directory](https://docs.netlify.com/configure-builds/overview/#definitions) 为 `dist/[your-project-name]/analog` 来部署服务端。

你也可以通过在项目的根目录放置一个 `netlify.toml` 来配置。下面是一个例子。

```toml
# 将 "my-analog-app" 修改成你想要部署的名字
[build]
  command = "nx build my-analog-app"
  publish = "dist/my-analog-app/analog/public"
  functions = "dist/my-analog-app/analog"
```

  </TabItem>
</Tabs>

## Vercel

Analog 无需额外配置即可部署到 [Vercel](https://vercel.com/)。

### 部署项目

<Tabs groupId="porject-type">
  <TabItem label="Create analog" value="create-analog">
默认情况下，部署到Vercel时，构建预设可以自动被处理。

1. 创建一个项目并且原则你的代码仓。

2. 点击 '部署'。

就这样！

  </TabItem>

  <TabItem label="Nx" value="nx">
为了支持Nx的项目，我们需要指定我们要部署的app。有几种方法可以实现，你可以选择以下任何一种（将 &#60;app&#62; 修改成你的app的名字）：

1. 在你的 `nx.json` 里指定 `defaultProject`

```json [nx.json]
{
  "defaultProject": "<app>"
}
```

2. 在你的项目根目录添加 `vercel.json` 并且定义 `buildCommand`：

```json [vercel.json]
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "nx build <app>"
}
```

3. 在你的 `package.json` 里定义 `buildCommand`：

```json [package.json]
{
  "scripts": {
    "build": "nx build <app>"
  }
}
```

#### Nx 和 Vercel

当使用 Nx 并在 Vercel 构建平台重用构建缓存时，如果你在本地构建时，缓存可能会被重用。这可能导致输出被存放到错误的目录。要解决这个问题，你可以用下面 `vite.config.ts` 的预设作为一个解决方案。

  </TabItem>
</Tabs>

### 手动设置预设

Vecel 有可能不会自动加载预设，这时，你可以执行以下操作的一种。

- 设置 `BUILD_PRESET` 环境变量为 `vercel`.
- 在 `vite.config.ts` 文件里指定预设：

```ts [vite.config.ts]
import { defineConfig } from 'vite';
import analog from '@analogjs/platform';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  /// ...other config
  plugins: [
    analog({
      nitro: {
        preset: 'vercel',
      },
    }),
  ],
}));
```

## Cloudflare 页面

Analog 仅需少许配置即可部署到 [Cloudflare](https://cloudflare.com/) 页面。

### 更新服务端的入口

需要在服务端的 `main.server.ts` 文件里提供完整的 URL 和 `APP_BASE_HREF` 令牌来支持 Cloudflare。

```ts
import { renderApplication } from '@angular/platform-server';
import { APP_BASE_HREF } from '@angular/common';
/// imports and bootstrap code ...

// set the base href
const baseHref = process.env['CF_PAGES_URL'] ?? `http://localhost:8888`;

export default async function render(url: string, document: string) {
  // Use the full URL and provide the APP_BASE_HREF
  const html = await renderApplication(bootstrap, {
    document,
    url: `${baseHref}${url}`,
    platformProviders: [{ provide: APP_BASE_HREF, useValue: baseHref }],
  });

  return html;
}
```

### 部署到 Cloudflare

要连接到你的代码仓并自动部署到 Cloudflare：

1. 登录到 Cloudflare 仪表板并选择你的账户。
2. 在账户首页，选择 Workers & Pages。
3. 选择 Create application > Pages > Connect to Git。
4. 输入 `npm run build` 作为 `Build Command`。
5. 输入 `dist/analog/public` 作为 `Build output directory`。
6. 保持其他设置默认，点击 `Save and Deploy`。

应用程序在每次 push 到代码仓时会自动部署到 Cloudflare 的网络。

#### Nx 和 Cloudlfare

在 Nx 工作区里，构建的输出在应用名下的目录，请按此更新 `Build output directory`。

例如：

构建输出目录：`dist/[your-project-name]/analog/public`

要在本地测试构建的话，运行以下的命令：

```bash
BUILD_PRESET=cloudflare-pages npx nx build [your-project-name]
```

### 在本地用 Wrangler 运行应用程序

你也可以在本地预览 Cloudflare 上部署的应用：

1. 运行之前，设置环境变量 `BUILD_PRESET` 为 `cloudflare-pages`

```bash
BUILD_PRESET=cloudflare-pages npm run build
```

2. 用 `wrangler` CLI 在本地运行应用

```bash
npx wrangler pages dev ./dist/analog/public
```

## Firebase

Analog 原生支持 [Firebase Hosting](https://firebase.google.com/docs/hosting) 以及云函数。

请查看已经配置了 Firebase 的[示例代码仓](https://github.com/brandonroberts/analog-angular-firebase-example)

**注意**: 你需要购买 **Blaze plan** 来使用云函数。

如果你的根目录还没有 `firebase.json`，Analog 会在你第一次运行的时候为你创建。在这个文件里，你需要将 `<your_project_id>` 修改为你的 Firebase 项目的 ID。

这个文件应该被提交到版本控制里。如果你想在 `firebase` 命令里手动设置你的项目 ID (通过 `--project <your_project_id>`)，你也可以创建一个 `.firebaserc` 文件：

```json [.firebaserc]
{
  "projects": {
    "default": "<your_project_id>"
  }
}
```

然后，只要在你的项目里安装 Firebase 依赖：

```bash
npm install -D firebase-admin firebase-functions firebase-functions-test
```

### 使用 Firebase CLI

如果你希望使用 Firebase CLI 来设置您的项目，它将为您获取项目 ID，添加所需的依赖项（参见上文），甚至使用 GitHub Actions 设置自动部署。

#### 全局安装 Firebase CLI

```bash
npm install -g firebase-tools
```

**注意**: 要部署 nodejs18 函数，你需要安装 [^11.18.0](https://github.com/firebase/firebase-tools/releases/tag/v11.18.0)。

#### 初始化你的 Firebase 项目

登录到 Firebase 并按照如下选择 **Hosting** 和 **Functions** 的选项：

```bash
firebase login
firebase init
 ◉ Functions: Configure a Cloud Functions directory and its files
 ◉ Hosting: Configure files for Firebase Hosting and (optionally) set up
GitHub Action deploys
```

除非你已经有了一个 Firebase 项目，选择 **Create a new project** 继续。Firebase 会创建一个新的项目并提供访问 web 控制台的 URL。

一旦你的项目创建以后，选择 **TypeScript** 作为语言来写云函数。按 _回车_ 选择默认参数。

当让你选择 **public directory** 时，输入 `dist/analog/public`。

下一步，让选择是否配置为 **single-page app.** 时，选择默认选项，N，这很重要！**不要**将你的项目配置成单页应用。

配置完成以后，确保你的 `firebase.json` 文件里以下的属性都已经正确配置。这确保服务端以及云函数可以正确运行。

```json [firebase.json]
{
  "functions": {
    "source": "dist/analog/server"
  },
  "hosting": [
    {
      "site": "<your_project_id>",
      "public": "dist/analog/public",
      "cleanUrls": true,
      "rewrites": [
        {
          "source": "**",
          "function": "server"
        }
      ]
    }
  ]
}
```

你可以在 [Firebase 文档](https://firebase.google.com/docs/hosting/quickstart) 查看更多细节。

### Firebase 函数

确保你按照前面的章节正确的配置了 Firebase 函数。下一步，你必须正确 [配置 Nitro](overview) 以使 Firebase 云函数工作。

在 `vite.config.ts` 里按照你的需求更新 `nitro` 的配置属性，类似 Node.js 的版本以及部署的区域。

```js [vite.config.ts]
nitro: {
  preset: 'firebase',
  firebase: {
    nodeVersion: '20',
    gen: 2,
    httpsOptions: {
      region: 'us-east1',
      maxInstances: 100,
    },
  },
},
```

### 本地预览

你可以预览你站点的本地版本而无需部署。

```bash
BUILD_PRESET=firebase npm run build
firebase emulators:start
```

### 用 CLI 部署到 Firebase

要部署到 Firebase，运行 `firebase deploy` 命令。

```bash
BUILD_PRESET=firebase npm run build
firebase deploy
```

### Firebase 警告

当你配置或者部署到 Firebase 时，你可能会看到如下的警告：

```
npm WARN EBADENGINE Unsupported engine {
npm WARN EBADENGINE   package: undefined,
npm WARN EBADENGINE   required: { node: '18' },
npm WARN EBADENGINE   current: { node: 'v20.11.0', npm: '10.2.4' }
npm WARN EBADENGINE }
```

```
 ⚠  functions: Couldn't find firebase-functions package in your source code. Have you run 'npm install'?
```

这些都是良性错误，可以忽略，只要您确保您的环境配置与 `Nitro` 匹配。

## Render.com

Analog 仅需少许配置即可部署到 [Render](https://cloudflare.com/)。

### Web 服务部署

1. [创建一个 Web 服务](https://dashboard.render.com/select-repo?type=web) 并选择要部署的代码仓。

2. 确保选择了 'Node' 环境。

3. [选择 Render 使用的 Node 版本](https://render.com/docs/node-version) (推荐 v18.13.0 或者更高) - Render 默认使用 Node 14, 会导致 Analog 站点构建失败。

4. 取决于你的包管理工具，设置构建命令为 `yarn && yarn build`，`npm install && npm run build` 或者 `pnpm i --shamefully-hoist && pnpm build`。

5. 设置启动命令为 `node dist/analog/server/index.mjs`。

6. 点击 '高级' 并且添加加一个环境变量 `BUILD_PRESET` 值为 `render-com`。

7. 点击 '创建 Web 服务'。

### 静态站点部署

如果使用 Analog 来预渲染静态内容，仅需少量配置即可部署静态站点 到 Render。

1. [创建一个新的静态站](https://dashboard.render.com/select-repo?type=static) 并选择你的代码仓。

2. 取决于你的包管理工具，设置构建命令为 `yarn && yarn build`，`npm install && npm run build` 或者 `pnpm i --shamefully-hoist && pnpm build`。

3. 设置发布目录为 `dist` 构建目录里的 `public` （例如： `dist/analog/public`）

4. 点击 '创建静态站点'

## Edgio

Analog 仅需少许配置即可部署到 [Edgio](https://edg.io)。

1. 安装 Edgio CLI:

```bash
npm i -g @edgio/cli
```

2. 在你的项目目录，初始化 Edgio：

```bash
edgio init --connector=@edgio/analogjs
```

3. 部署到 Edgio

```bash
edgio deploy
```

## GitHub 页面 (静态站点部署)

Analog 支持部署到静态站点到 [GitHub 页面](https://pages.github.com/)。
当部署到 Github 页面时，你必须在 `gh-pages` 分支的根目录添加一个名为 `.nojekyll` 的空文件。

你可以用 [Analog Publish Github Pages](https://github.com/marketplace/actions/analog-publish-github-pages) 动作来自动化部署：

```yaml
name: Build and Deploy

on:
  push:
    branches:
      - 'main'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20.x'
      - uses: k9n-dev/analog-publish-gh-pages@v1.0.0
        with:
          access-token: ${{ secrets.ACCESS_TOKEN }}
          # further options are available.
          # see: https://github.com/marketplace/actions/analog-publish-github-pages
```

或者你也可以像这样自己实现：

```yaml
name: Build Deploy

on:
  push:
    branches:
      - '*' # deploy on all branches (but a --dry-run flag is added for branches (see code below))

env:
  TARGET_DIR: dist/analog/public

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20.x'
      - name: Set environment variable based on branch
        run: |
          if [[ $GITHUB_REF == refs/heads/main || $GITHUB_REF == refs/heads/master ]]; then
            echo "Branch is main or master. Setting DRY_RUN_OPTION to empty."
            echo "DRY_RUN_OPTION=" >> $GITHUB_ENV
          else
            echo "Branch is not main or master. Setting DRY_RUN_OPTION to '--dry-run'."
            echo "DRY_RUN_OPTION=--dry-run" >> $GITHUB_ENV
          fi
      - name: Install
        run: npm ci
      - name: Build
        run: npm run build
      - name: Deploy Website (gh-pages branch)
        env:
          GH_TOKEN: ${{ secrets.ACCESS_TOKEN }} # A token must be created to be able to deploy on the gh-pages branch
          CNAME_OPTION: --cname=yourdomain.dev # omit if your not running it on a custom domain
        run: |
          echo "DRY_RUN_OPTION=$DRY_RUN_OPTION"
          npx angular-cli-ghpages --no-silent --dir="${{env.TARGET_DIR}}" $CNAME_OPTION $DRY_RUN_OPTION
```
