import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Code Generation

Analog supports automated code generation using Nx Generators and Angular Schematics.

## Generate a Page

This command generates a page inside our `pages` folder with minimal configuration out of the box.

<Tabs groupId="project-type">
  <TabItem value="Nx">

## Generators

The Analog plugin for Nx provides a series of generators that help automate some of the frequent tasks inside an Analog project, like generating a **Page**. To use these generators, the **Nx Console** extension can be installed or they can be invoked manually using:

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

  <TabItem label="Schematics" value="schematics">

## Angular Schematics

Analog provides a series of schematics that help automate some of the frequent tasks inside an Analog workspace, like generating a **Page**. To use these schematics, use the generate command:

```shell
ng g @analogjs/platform:page --pathname=index --project=/
```

it also works with the Analog specific filenames, **Note: this names needs to be surrounded by single quotes** ex:

```shell
ng g @analogjs/platform:page --pathname='(blog)' --project=/
```

The schematic as well accepts subfolders to structure our project properly.

```shell
ng g @analogjs/platform:page --pathname='products/[products]' --project=/
```

  </TabItem>
</Tabs>
