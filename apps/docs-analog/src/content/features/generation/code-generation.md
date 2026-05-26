import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Code Generation

Analog supports automated code generation using Nx Generators and Angular Schematics.

<Tabs groupId="project-type">
  <TabItem value="Nx Generators">

### Generators

The Analog plugin for Nx provides a series of generators that help automate some of the frequent tasks inside an Nx workspace, like generating an **application** or **page**. To use these generators, the **Nx Console** extension can be installed or they can be invoked manually using the Nx CLI:

### Generating an application

To generate a new Analog application within an Nx workspace, use the application generator:

```shell
npx nx generate @analogjs/platform:application my-app
```

### Generating pages

```shell
npx nx generate @analogjs/platform:page --pathname=index --project=analog-app
```

it also works with the Analog specific filenames, **Note: this names needs to be surrounded by single quotes** ex:

```shell
npx nx generate @analogjs/platform:page --pathname='(blog)' --project=analog-app
```

The schematic as well accepts subfolders to structure our project properly.

```shell
npx nx generate @analogjs/platform:page --pathname='products/[products]' --project=analog-app
```

  </TabItem>

  <TabItem label="Angular Schematics" value="schematics">

### Angular Schematics

Analog provides a series of schematics that help automate some of the frequent tasks inside an Angular CLI workspace, like generating an **application** or a **page**. To use these schematics, use the generate command:

### Generating an application

To generate a new Analog application within an Angular CLI workspace, use the application schematic:

```shell
npx ng generate @analogjs/platform:application my-app
```

### Generating pages

```shell
npx ng g @analogjs/platform:page --pathname=index --project=/
```

it also works with the Analog specific filenames, **Note: this names needs to be surrounded by single quotes** ex:

```shell
npx ng g @analogjs/platform:page --pathname='(blog)' --project=/
```

The schematic as well accepts subfolders to structure our project properly.

```shell
npx ng g @analogjs/platform:page --pathname='products/[products]' --project=/
```

  </TabItem>
</Tabs>
