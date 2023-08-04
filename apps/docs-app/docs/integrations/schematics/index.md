---
sidebar_position: 4
---

# Angular Schematics

## Overview

Analogjs provides a series of schematics that help automate some of the frequent tasks inside an Analog workspace, like generating a **Page**, a starting point for a **Blog** (work in progress), or generating **Posts** (work in progress). To use these schematics we can use this command:

### Generate a Page

This command will generate a page inside our `pages` folder with minimal configuration out of the box.

```shell
ng g @analogjs/platform:page --pathname=index --project=analog-app
```

it also works with the Analog specific filenames, **Note: this names needs to be surrounded by single quotes** ex:

```shell
ng g @analogjs/platform:page --pathname='(blog)' --project=analog-app
```

The schematic as well accepts subfolders to structure our project properly.

```shell
ng g @analogjs/platform:page --pathname='products/[products]' --project=analog-app
```
