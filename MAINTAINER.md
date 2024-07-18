# Contributing (Maintainer)

## Adding and updating an package

Adding or updating a package requires some extra step if its part of `dependencies` or `devDependencies`.

### Add/Update package.json version migration

- Go to `packages/content/migrations/migration.json`
- make and entry like below

```json
    "next-analog-version": {
      "version": "current-analog-version",
      "description": "Add/Updates package - description about why its needed",
      "packages": {
        "package-name": {
          "version": "^package-version",
          "alwaysAddToPackageJson": true
        }
      }
```

### Add/Update package.json to latest version for template application used with create-analog

- Go to `packages/create-analog`
- There are 2 templates as of now
  - `packages/create-analog/template-angular-v17`
  - `packages/create-analog/template-blog`
- Go to `package.json` and Add/Update the package in both templates

## Add/Update version and tests for nx-plugin

- Go to `packages/nx-plugin/src/generators/app/versions`
- There are folders for each version of Nx
- Choose the folder where this package needs to be added
- For Nx 17 the folder is `packages/nx-plugin/src/generators/app/versions/nx_17_X`
- Open `version.ts` and make an Key-Value entry like `export const V17_X_PACKAGENAME = '^package-version';` if the package already exists, update the `package-version`.
- Next open `packages/nx-plugin/src/generators/app/versions/dependencies.ts` if its part of dependecies.
- If this is an existing package no change is needed, but if its a new package, import the `Key-Value` entry you made

```ts
import{
  ..., ---> existing list
  V17_X_PACKAGENAME,
} from './nx_17_X/versions';
```

- Find the return statement for the Nx Version, for Nx 17 it may look like below, notice the comment

```ts
// return latest 17.X deps for versions >= 17.0.0
return {
  '@angular/platform-server': angularVersion,
  '@analogjs/content': V17_X_ANALOG_JS_CONTENT,
  '@analogjs/router': V17_X_ANALOG_JS_ROUTER,
  'front-matter': V17_X_FRONT_MATTER,
  marked: V17_X_MARKED,
  'marked-gfm-heading-id': V17_X_MARKED_GFM_HEADING_ID,
  'marked-highlight': V17_X_MARKED_HIGHLIGHT,
  mermaid: V17_X_MERMAID,
  prismjs: V17_X_PRISMJS,
};
```

- For new packge make an entry into the return array

```ts
// return latest 17.X deps for versions >= 17.0.0
return {
  '@angular/platform-server': angularVersion,
  '@analogjs/content': V17_X_ANALOG_JS_CONTENT,
  '@analogjs/router': V17_X_ANALOG_JS_ROUTER,
  'front-matter': V17_X_FRONT_MATTER,
  marked: V17_X_MARKED,
  'marked-gfm-heading-id': V17_X_MARKED_GFM_HEADING_ID,
  'marked-highlight': V17_X_MARKED_HIGHLIGHT,
  mermaid: V17_X_MERMAID,
  prismjs: V17_X_PRISMJS,
  packagename: V17_X_PACKAGENAME,
};
```

- Next step is to update tests
- Go to `packages/nx-plugin/src/generators/app/generator.spec.ts`
- Search for the current version on Nx, for Nx17 you will find `const verifyCoreDependenciesNxV17_AngularV16_X`
- Add the current package into the const

```ts
expect(dependencies['packagename']).toBe('^package-version');

expect(devDependencies['packagename']).toBe('^package-version');
```
