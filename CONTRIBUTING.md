# Contributing

Analog is an MIT-licensed open source project with its ongoing development made by contributors.

## Contributing to the framework

### Folder structure

Source code for the Analog framework exists under the `packages/` folder. To contribute features or bug fixes to the framework, locate the relevant code in one of the `packages` sub-folder. In addition to the `create-analog` sub-folder, there is a sub-folder for each of the `npm` packages in the `@analogjs/*` scope:

- `packages/create-analog` → `create-analog`
- `packages/vite-plugin-angular` → `@analogjs/vite-plugin-angular`

### Setup

Analog uses [pnpm](https://pnpm.io/) to manage its dependencies.

Before opening a pull request, run the following command from the root folder to make sure your development dependencies are up-to-date:

```shell
pnpm i
```

### Running locally

To serve the example application locally, run the following command from the root folder:

```shell
pnpm dev
```

### Build

Analog uses [Nx](https://nx.dev) for builds. To build all projects locally, run the following command from the root folder:

```shell
pnpm build
```

### Testing

Analog uses [Jest](https://jestjs.io) for tests. To test all projects locally, run the following command from the root folder:

```shell
pnpm test
```

## Contributing to the docs and analogjs.org website

### Folder structure

Source code for the Analog docs and the analogjs.org website exists under the `apps/docs-app` project folder. To contribute documentation or website content, locate the relevant source code in one of the sub-folders:

- `blog` - Blog (unused).
- `docs` - Documentation pages with React MDX support.
- `src/components` - React components.
- `src/css` - Global styles.
- `src/pages` - React page components.
- `static` - Images and other static assets.

### Setup

Analog uses [pnpm](https://pnpm.io/) to manage its dependencies.

Before opening a pull request, run the following command from the root folder to make sure your development dependencies are up-to-date:

```shell
pnpm i
```

### Running locally

Analog uses [Docusaurus](https://docusaurus.io/) to develop the docs and analogjs.org website. Run the following command from the `apps/docs-app` folder to serve the website:

```shell
pnpm nx serve
```

or alternatively run this command from the root folder:

```shell
pnpm nx serve docs-app
```

Once the development server is up and running, you can preview the docs and website by visiting [http://localhost:3000](http://localhost:3000).

### Build

Analog uses [Nx](https://nx.dev) to build the docs and analogjs.org website. To build the website locally, run the following command from the `apps/docs-app` folder:

```shell
pnpm nx build
```

or alternatively run this command from the root folder:

```shell
pnpm nx build docs-app
```

### Running static website locally

To run the generated static website locally, run the following command from the `apps/docs-app` folder:

```shell
pnpm nx serve-static
```

or alternatively run this command from the root folder:

```shell
pnpm nx serve-static docs-app
```

## Submitting pull requests

**Please follow these basic steps to simplify pull request reviews. If you don't you'll probably just be asked to anyway.**

- Please rebase your branch against the current `main`.
- Follow the `Setup` steps above to make sure your development dependencies are up-to-date.
- Please ensure the test suite passes before submitting a PR.
- If you've added new functionality, **please** include tests which validate its behavior.
- Make reference to possible [issues](https://github.com/analogjs/analog/issues) on PR comment.
- PRs may include multiple commits. However, please keep content of all commits related. Raise separate PRs for disjoint changes.

## Submitting bug reports

- Search through issues to see if a previous issue has already been reported and/or fixed.
- Provide a _small_ reproduction using a [StackBlitz project](https://stackblitz.com) or a GitHub repository.
- Please detail the affected browser(s) and operating system(s).
- Please be sure to state which version of Angular, node, and package manager (npm, pnpm, yarn) you're using.

## Submitting new features

- We value keeping the API surface small and concise, which factors into whether new features are accepted.
- Submit an issue with the prefix `RFC:` with your feature request.
- The feature will be discussed and considered.
- Once the PR is submitted, it will be reviewed and merged once approved.

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

## Questions and requests for support

Questions and requests for support should not be opened as issues and should be handled in the following ways:

- Start a new [Q&A Discussion](https://github.com/analogjs/analog/discussions/new?category=q-a) on GitHub.
- Start a new thread in the `#help` forum on the [Discord server](https://chat.analogjs.org/)

## <a name="commit"></a> Commit message guidelines

We have very precise rules over how our git commit messages can be formatted. This leads to **more
readable messages** that are easy to follow when looking through the **project history**. But also,
we use the git commit messages to **generate the changelog**.

### Commit message format

Each commit message consists of a **header**, a **body** and a **footer**. The header has a special
format that includes a **type**, a **scope** and a **subject**:

```
<type>(<scope>): <subject>
<BLANK LINE>
<body>
<BLANK LINE>
<footer>
```

The **header** is mandatory and the **scope** of the header is optional.

Any line of the commit message cannot be longer than 100 characters! This allows the message to be easier
to read on GitHub as well as in various git tools.

The footer should contain a [closing reference to an issue](https://help.github.com/articles/closing-issues-via-commit-messages/) if any.

Samples: (even more [samples](https://github.com/analogjs/analog/commits/main))

```
docs(changelog): update changelog to beta.5
```

```
fix(release): need to depend on latest rxjs and zone.js

The version in our package.json gets copied to the one we publish, and users need the latest of these.
```

### Revert

If the commit reverts a previous commit, it should begin with `revert:`, followed by the header of the reverted commit. In the body it should say: `This reverts commit <hash>.`, where the hash is the SHA of the commit being reverted.

### Type

Must be one of the following:

- **build**: Changes that affect the build system or external dependencies (example scopes: gulp, broccoli, npm)
- **ci**: Changes to our CI configuration files and scripts (example scopes: Travis, Circle, BrowserStack, SauceLabs)
- **docs**: Documentation only changes
- **feat**: A new feature
- **fix**: A bug fix
- **perf**: A code change that improves performance
- **refactor**: A code change that neither fixes a bug nor adds a feature
- **style**: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc.)
- **test**: Adding missing tests or correcting existing tests

### Scope

The scope should be the name of the npm package affected (as perceived by the person reading the changelog generated from commit messages.

The following is the list of currently supported scopes:

- **vite-plugin-angular**
- **vite-plugin-nitro**
- **create-analog**
- **astro-angular**
- **router**
- **platform**
- **content**
- **nx-plugin**
- **trpc**

### Subject

The subject contains a succinct description of the change:

- use the imperative, present tense: "change" not "changed" nor "changes"
- don't capitalize the first letter
- no dot (.) at the end

### Body

Just as in the **subject**, use the imperative, present tense: "change" not "changed" nor "changes".
The body should include the motivation for the change and contrast this with previous behavior.

### Footer

The footer should contain any information about **Breaking Changes** and is also the place to
reference GitHub issues that this commit **Closes**.

**Breaking Changes** should start with the word `BREAKING CHANGE:` with a space or two newlines. The rest of the commit message is then used for this.

Example:

```
feat(scope): commit message

BREAKING CHANGES:

Describe breaking changes here

BEFORE:

Previous code example here

AFTER:

New code example here
```
