import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 代码生成

Analog 支持使用 NX 生成器 和 Angular 原理图 自动生成代码。

<Tabs groupId="project-type">
  <TabItem value="Nx 生成器">

### 生成器

NX 的 Analog 插件提供了一系列生成器帮助在 NX 的工作区里自动化一些高频任务，例如生成一个**应用程序**或者**页面**。要使用生成器，可以安装 **Nx Console** 扩展或者直接通过 NX CLI 手动调用：

### 生成一个应用程序

使用应用生成器在 NX 工作区里创建一个新的 Analog 应用：

```shell
npx nx generate @analogjs/platform:app my-app
```

### 生成页面

```shell
npx nx generate @analogjs/platform:page --pathname=index --project=analog-app
```

它同样支持指定 Analog 的文件，**注意: 名字需要用单引号括起来**，例如：

```shell
npx nx generate @analogjs/platform:page --pathname='(blog)' --project=analog-app
```

生成器同样支持子目录。

```shell
npx nx generate @analogjs/platform:page --pathname='products/[products]' --project=analog-app
```

  </TabItem>

  <TabItem label="Angular 原理图" value="原理图">

### Angular 原理图

Analog 提供了一系列原理图帮助在 Angular CLI 工作区自动化一些高频任务，例如生成**应用程序**或者**页面**，用 generate 命令可以使用这些原理图：

### 生成一个应用程序

要在 Angular CLI 工作区生成一个新的 Analog 应用程序，使用 application 原理图：

```shell
npx ng generate @analogjs/platform:app my-app
```

### 生成页面

```shell
npx ng g @analogjs/platform:page --pathname=index --project=/
```

它同样支持 Ananlog 特定的文件名，**注意：名字必须用单引号括起来**，例如：

```shell
npx ng g @analogjs/platform:page --pathname='(blog)' --project=/
```

生成器同样支持子目录。

```shell
npx ng g @analogjs/platform:page --pathname='products/[products]' --project=/
```

  </TabItem>
</Tabs>
