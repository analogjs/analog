---
title: Updating Analog - Migration and Version Updates Guide
description: Learn how to update Analog to the latest version using ng update or nx migrate commands. Keep your projects up-to-date with the latest features and improvements.
keywords:
  [
    'updating',
    'migration',
    'ng update',
    'nx migrate',
    'version updates',
    'Angular CLI',
    'Nx workspace',
  ]
image: https://analogjs.org/img/analog-banner.png
url: https://analogjs.org/docs/features/updating/overview
type: documentation
author: Analog Team
publishedTime: '2022-01-01T00:00:00.000Z'
modifiedTime: '2024-01-01T00:00:00.000Z'
section: Updating
tags: ['updating', 'migration', 'version-updates']
---

import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Updating to the latest version

You can use the `ng update` command for an Angular CLI workspace, or the `nx migrate` command for updating within an Nx workspace.

<Tabs groupId="app-upgrader">
  <TabItem label="ng update" value="ng-update">

### ng update

To update an Analog project with the `ng update` command:

```shell
ng update @analogjs/platform@latest
```

</TabItem>

  <TabItem label="Nx migrate" value="nx-migrate">

### Nx Migrate

To update an Analog project with the `nx migrate` command:

```shell
nx migrate @analogjs/platform@latest
```

</TabItem>
</Tabs>
