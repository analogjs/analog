import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 提供商

Analog 支持通过 [Nitro](https://nitro.unjs.io) 作为其底层服务器引擎，几乎无需额外配置即可部署到许多提供商。您可以在 [Nitro 部署文档](https://nitro.unjs.io/deploy) 中找到更多提供商。

## Zerops

:::info
[Zerops](https://zerops.io) 是 AnalogJS 的**官方**部署合作伙伴。
:::

Analog 支持通过简单的配置文件将静态和服务器端渲染的应用程序部署到 [Zerops](https://zerops.io)。

> 一个 Zerops 项目可以包含多个 Analog 项目。请参阅 [静态](https://github.com/zeropsio/recipe-analog-static) 和 [服务器端渲染](https://github.com/zeropsio/recipe-analog-nodejs) Analog 应用程序的示例仓库以快速入门。

### 静态 (SSG) Analog 应用

如果您的项目不支持 SSG，请设置您的项目以进行[静态站点生成](/docs/features/server/static-site-generation)。

#### 1. 在 Zerops 中创建一个项目

项目和服务可以通过 [添加项目](https://app.zerops.io/dashboard/project-add) 向导添加或使用 YAML 结构导入：

```yml
project:
  name: recipe-analog
services:
  - hostname: app
    type: static
```

这将创建一个名为 `recipe-analog` 的项目，并包含一个名为 `app` 的 Zerops 静态服务。

#### 2. 添加 zerops.yml 配置

要告诉 Zerops 如何构建和运行您的站点，请将 `zerops.yml` 添加到您的仓库：

```yml
zerops:
  - setup: app
    build:
      base: nodejs@20
      buildCommands:
        - pnpm i
        - pnpm build
      deployFiles:
        - public
        - dist/analog/public/~
    run:
      base: static
```

#### 3. [触发构建和部署管道](#build--deploy-your-code)

### 服务器端渲染 (SSR) Analog 应用

如果您的项目尚未准备好 SSR，请设置您的项目以进行[服务器端渲染](/docs/features/server/server-side-rendering)。

#### 1. 在 Zerops 中创建一个项目

项目和服务可以通过 [添加项目](https://app.zerops.io/dashboard/project-add) 向导添加或使用 YAML 结构导入：

```yml
project:
  name: recipe-analog
services:
  - hostname: app
    type: nodejs@20
```

这将创建一个名为 `recipe-analog` 的项目，并包含一个名为 `app` 的 Zerops Node.js 服务。

#### 2. 添加 zerops.yml 配置

要告诉 Zerops 如何构建和运行您的站点，请将 `zerops.yml` 添加到您的仓库：

```yml
zerops:
  - setup: app
    build:
      base: nodejs@20
      buildCommands:
        - pnpm i
        - pnpm build
      deployFiles:
        - public
        - node_modules
        - dist
    run:
      base: nodejs@20
      ports:
        - port: 3000
          httpSupport: true
      start: node dist/analog/server/index.mjs
```

#### 3. [触发构建和部署管道](#build-deploy-your-code)

---

### 构建和部署您的代码

#### 通过将服务与您的 GitHub / GitLab 仓库连接来触发管道

通过将服务与您的 GitHub / GitLab 仓库连接，您的代码可以在每次提交或添加新标签时自动部署。此连接可以在服务详细信息中设置。

#### 使用 Zerops CLI (zcli) 触发管道

您还可以使用 Zerops CLI 从终端或现有的 CI/CD 手动触发管道。

1. 安装 Zerops CLI。

```bash
# 直接下载 zcli 二进制文件，
# 使用 https://github.com/zeropsio/zcli/releases
npm i -g @zerops/zcli
```

2. 在 Zerops 应用中打开 [设置 > 访问令牌管理](https://app.zerops.io/settings/token-management) 并生成一个新的访问令牌。

3. 使用以下命令登录您的访问令牌：

```bash
zcli login <token>
```

4. 导航到您的应用程序根目录（`zerops.yml` 所在位置）并运行以下命令以触发部署：

```bash
zcli push
```

#### 使用 GitHub / Gitlab 触发管道

您还可以查看 [Zerops 文档](https://docs.zerops.io/) 中的 [Github 集成](https://docs.zerops.io/references/github-integration) / [Gitlab 集成](https://docs.zerops.io/references/gitlab-integration) 以进行 git 集成。

## Netlify

Analog 支持通过 [Netlify](https://netlify.com/) 进行部署，几乎无需额外配置。

### 部署项目

<Tabs groupId="porject-type">
  <TabItem label="Create analog" value="create-analog">
在 Netlify 项目的构建设置中，将 [发布目录](https://docs.netlify.com/configure-builds/overview/#definitions) 设置为 `dist/analog/public` 以部署静态资源，并将 [函数目录](https://docs.netlify.com/configure-builds/overview/#definitions) 设置为 `dist/analog` 以部署服务器。
  </TabItem>

  <TabItem label="Nx" value="nx">
在 Netlify 项目的 Web UI 中的构建设置中，执行以下操作。
1. 将 [构建命令](https://docs.netlify.com/configure-builds/overview/#definitions) 设置为 `nx build [your-project-name]`
2. 将 [发布目录](https://docs.netlify.com/configure-builds/overview/#definitions) 设置为 `dist/[your-project-name]/analog/public` 以部署静态资源
3. 将 [函数目录](https://docs.netlify.com/configure-builds/overview/#definitions) 设置为 `dist/[your-project-name]/analog` 以部署服务器。

您还可以通过在存储库的根目录中放置一个 `netlify.toml` 文件来进行配置。以下是一个示例配置。

```toml
# 将 "my-analog-app" 替换为您要部署的应用名称
[build]
  command = "nx build my-analog-app"
  publish = "dist/my-analog-app/analog/public"
  functions = "dist/my-analog-app/analog"
```

  </TabItem>
</Tabs>

## Vercel

Analog 支持在 [Vercel](https://vercel.com/) 上进行部署，无需额外配置。

### 部署项目

<Tabs groupId="porject-type">
  <TabItem label="Create analog" value="create-analog">
默认情况下，部署到 Vercel 时，构建预设会自动处理。

1. 创建一个新项目并选择包含代码的存储库。

2. 点击“Deploy”。

就这么简单！

  </TabItem>

  <TabItem label="Nx" value="nx">
为了使其与 Nx 一起工作，我们需要定义要构建的特定应用程序。您可以选择以下方法之一（将 &#60;app&#62; 替换为您的应用名称）：

1. 在 `nx.json` 中定义 `defaultProject`

```json [nx.json]
{
  "defaultProject": "<app>"
}
```

2. 在项目根目录中创建一个 `vercel.json` 文件并定义 `buildCommand`：

```json [vercel.json]
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "buildCommand": "nx build <app>"
}
```

3. 在 `package.json` 中定义 `buildCommand`：

```json [package.json]
{
  "scripts": {
    "build": "nx build <app>"
  }
}
```

#### Nx 和 Vercel

当在 Vercel 构建平台上使用 Nx 并重用构建缓存时，如果您在本地构建了它，可能会导致缓存被重用。这可能导致输出被放置在错误的位置。为了解决这个问题，您可以在 `vite.config.ts` 文件中使用预设作为解决方法。

  </TabItem>
</Tabs>

### 手动设置预设

在某些情况下，Vercel 可能不会自动加载预设。在这种情况下，您可以执行以下操作之一。

- 将 `BUILD_PRESET` 环境变量设置为 `vercel`。
- 在 `vite.config.ts` 文件中设置预设：

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

## Cloudflare Pages

Analog 支持通过 [Cloudflare](https://cloudflare.com/) Pages 进行部署，几乎无需额外配置。

### 部署到 Cloudflare

要连接您的存储库并自动部署到 Cloudflare：

1. 登录到 Cloudflare 仪表板并选择您的帐户。
2. 在帐户主页中，选择 Workers & Pages。
3. 选择创建应用程序 > Pages > 连接到 Git。
4. 将 `npm run build` 输入为 `Build Command`。
5. 将 `dist/analog/public` 输入为 `Build output directory`。
6. 保留其他默认设置，点击“保存并部署”。

应用程序将在每次推送到存储库时部署到 Cloudflare 的网络。

#### Nx 和 Cloudflare

对于 Nx 工作区，构建输出位于应用程序名称下。相应地更新 `Build output directory`。

例如：

构建输出目录：`dist/[your-project-name]/analog/public`

要在本地测试构建，请运行以下命令：

```bash
BUILD_PRESET=cloudflare-pages npx nx build [your-project-name]
```

### 使用 Wrangler 本地运行应用程序

您还可以在本地预览在 Cloudflare 上运行的应用程序：

1. 在运行构建之前将环境变量 `BUILD_PRESET` 设置为 `cloudflare-pages`

```bash
BUILD_PRESET=cloudflare-pages npm run build
```

2. 使用 `wrangler` CLI 在本地运行应用程序

```bash
npx wrangler pages dev ./dist/analog/public
```

## Firebase 应用托管

Analog 支持 [Firebase 应用托管](https://firebase.google.com/docs/app-hosting)，无需额外配置。

**注意**：您需要使用 **Blaze 计划** 才能使用 Firebase 应用托管部署 Analog 应用程序。

请按照 [入门指南](https://firebase.google.com/docs/app-hosting/get-started#step-1:) 将您的 GitHub 存储库连接到 Firebase 应用托管。

## Firebase 托管

Analog 支持使用 Cloud Functions 和 [Firebase 应用托管](https://firebase.google.com/docs/app-hosting) 的 [Firebase 托管](https://firebase.google.com/docs/hosting)，无需额外配置。

请参阅配置了 Firebase 的 [示例仓库](https://github.com/brandonroberts/analog-angular-firebase-example)

**注意**：您需要使用 **Blaze 计划** 才能使用 Analog 和 Cloud Functions。

如果您的根目录中尚未有 `firebase.json` 文件，Analog 会在您第一次运行时创建一个。在此文件中，您需要将 `<your_project_id>` 替换为您的 Firebase 项目 ID。

此文件应提交到版本控制中。如果您不想手动将项目 ID 传递给 `firebase` 命令（使用 `--project <your_project_id>`），您还可以创建一个 `.firebaserc` 文件：

```json [.firebaserc]
{
  "projects": {
    "default": "<your_project_id>"
  }
}
```

然后，只需将 Firebase 依赖项添加到您的项目中：

```bash
npm install -D firebase-admin firebase-functions firebase-functions-test
```

### 使用 Firebase CLI

如果您更喜欢使用 Firebase CLI 设置项目，它将为您获取项目 ID，添加所需的依赖项（见上文），甚至设置与 GitHub Actions 的自动部署。

#### 全局安装 Firebase CLI

```bash
npm install -g firebase-tools
```

**注意**：您需要使用 [^11.18.0](https://github.com/firebase/firebase-tools/releases/tag/v11.18.0) 才能部署 nodejs18 函数。

#### 初始化您的 Firebase 项目

登录 Firebase 并选择 **Hosting** 和 **Functions** 选项，如下所示：

```bash
firebase login
firebase init
 ◉ Functions: Configure a Cloud Functions directory and its files
 ◉ Hosting: Configure files for Firebase Hosting and (optionally) set up
GitHub Action deploys
```

除非您有现有的 Firebase 项目，否则请选择 **创建新项目** 继续。Firebase 将提供一个新项目并提供访问 Web 控制台以管理它的 URL。

项目创建后，选择 **TypeScript** 作为编写 Cloud Functions 的语言。按 _Enter_ 接受默认参数继续。

当提示输入 **public directory** 时，输入 `dist/analog/public`。

在下一步中，是否配置为 **单页应用程序**，选择默认选项 N 。这很重要！**不要** 将项目配置为单页应用程序。

设置完成后，确保在 `firebase.json` 文件中正确配置以下属性。这确保服务器端渲染可以与 Cloud Functions 一起正常工作：

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

您可以在 [Firebase 文档](https://firebase.google.com/docs/hosting/quickstart) 中找到更多详细信息。

### Firebase 函数

确保按照上一节中的描述设置 Firebase 函数。接下来，您必须正确配置 [Nitro](overview) 以使 Firebase Cloud Functions 正常工作。

在 `vite.config.ts` 中使用适合您需求的配置选项更新 `nitro` 属性，例如您的 Node.js 版本和首选区域。

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

### 或者，在单个 Firebase 托管站点中使用多个 AnalogJS 项目（/app1，/app2）

这利用 cloud run 服务来托管 AnalogJS 项目，并使用重写规则将流量从 firebase 转发到 cloud run。

[使用自定义 URL 前缀进行部署](/docs/features/deployment/overview#deploying-with-a-custom-url-prefix)。

```json [firebase.json]
{
  "hosting": [
    {
      "site": "<your_project_id>",
      "public": "public",
      "cleanUrls": true,
      "rewrites": [
        {
          "source": "/app1",
          "run": {
            "serviceId": "app1",
            "region": "us-central1",
            "pinTag": false
          }
        },
        {
          "source": "/app1/**",
          "run": {
            "serviceId": "app1",
            "region": "us-central1",
            "pinTag": false
          }
        }
      ]
    }
  ]
}
```

### 本地预览

您可以预览站点的本地版本以进行测试，而无需部署。

```bash
BUILD_PRESET=firebase npm run build
firebase emulators:start
```

### 使用 CLI 部署到 Firebase 托管

要部署到 Firebase 托管，请运行 `firebase deploy` 命令。

```bash
BUILD_PRESET=firebase npm run build
firebase deploy
```

### Firebase 警告

在配置或部署 Firebase 时，您可能会看到如下警告：

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

这些是无害的错误，可以忽略，只要确保您的环境配置与 `Nitro` 匹配即可。

## Render.com

Analog 支持通过 [Render](https://render.com/) 进行部署，几乎无需额外配置。

### Web 服务部署

1. [创建一个新的 Web 服务](https://dashboard.render.com/select-repo?type=web) 并选择包含代码的存储库。

2. 确保选择 'Node' 环境。

3. [指定 Render 使用的 Node 版本](https://render.com/docs/node-version)（推荐使用 v18.13.0 或更高版本）- Render 默认使用 Node 14，这会导致 Analog 站点构建失败。

4. 根据您的包管理器，将构建命令设置为 `yarn && yarn build`、`npm install && npm run build` 或 `pnpm i --shamefully-hoist && pnpm build`。

5. 更新启动命令为 `node dist/analog/server/index.mjs`。

6. 点击 'Advanced' 并添加一个环境变量 `BUILD_PRESET`，值为 `render-com`。

7. 点击 'Create Web Service'。

### 静态站点部署

如果使用 Analog 预渲染静态内容，可以通过最少的配置在 Render 上部署静态站点。

1. [创建一个新的静态站点](https://dashboard.render.com/select-repo?type=static) 并选择包含代码的存储库。

2. 根据您的包管理器，将构建命令设置为 `yarn && yarn build`、`npm install && npm run build` 或 `pnpm i --shamefully-hoist && pnpm build`。

3. 将发布目录设置为 `dist` 构建目录中的 `public` 目录（例如 `dist/analog/public`）。

4. 点击 'Create Static Site'。

## Edgio

Analog 支持通过 [Edgio](https://edg.io) 进行部署，几乎无需额外配置。

1. 安装 Edgio CLI：

```bash
npm i -g @edgio/cli
```

2. 在项目目录中初始化 Edgio：

```bash
edgio init --connector=@edgio/analogjs
```

3. 部署到 Edgio

```bash
edgio deploy
```

## GitHub Pages（静态站点部署）

Analog 支持在 [GitHub Pages](https://pages.github.com/) 上部署静态站点。
在将站点部署到 GitHub Pages 时，必须在 `gh-pages` 分支的根目录中添加一个名为 `.nojekyll` 的空文件。

您可以使用 [Analog Publish Github Pages](https://github.com/marketplace/actions/analog-publish-github-pages) 动作自动化部署：

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
          # 还有更多选项可用。
          # 参见：https://github.com/marketplace/actions/analog-publish-github-pages
```

或者，您可以像这样自己进行操作：

```yaml
name: Build Deploy

on:
  push:
    branches:
      - '*' # 在所有分支上部署（但为分支添加了 --dry-run 标志（见下文代码））

env:
  TARGET_DIR: dist/analog/public

jobs:
  # 构建项目并将其推送到 gh-pages 分支
  build-and-push:
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
          GH_TOKEN: ${{ secrets.ACCESS_TOKEN }} # 必须创建一个令牌才能在 gh-pages 分支上部署
          CNAME_OPTION: --cname=yourdomain.dev # 如果不在自定义域上运行，请省略
        # 运行部署脚本将构建的项目推送到 gh-pages 分支
        # 默认贡献者是 github-actions[bot]
        run: |
          echo "DRY_RUN_OPTION=$DRY_RUN_OPTION"
          npx angular-cli-ghpages --no-silent --dir="${{env.TARGET_DIR}}" \
            --name="github-actions[bot]" \
            --email="github-actions[bot]@users.noreply.github.com" \
            --branch="gh-pages" \
            --message="Deploy: $(git log -1 --pretty=%B)" \
            $DRY_RUN_OPTION

  # 从 gh-pages 分支部署
  deploy-pages:
    needs: build-and-push
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Checkout gh-pages
        uses: actions/checkout@v4
        with:
          ref: gh-pages

      - name: Setup Pages
        uses: actions/configure-pages@v4

      - name: Upload artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: '.'

      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```
