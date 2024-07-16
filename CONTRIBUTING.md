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

Analog uses [Vitest](https://vitest.dev) for tests. To test all projects locally, run the following command from the root folder:

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

- Please rebase your branch against the current `beta` branch.
- Follow the `Setup` steps above to make sure your development dependencies are up-to-date.
- Please ensure the test suite passes before submitting a PR.
- If you've added new functionality, **please** include tests which validate its behavior.
- Make reference to possible [issues](https://github.com/analogjs/analog/issues) on PR comment.
- PRs may include multiple commits. However, please keep content of all commits related. Raise separate PRs for disjoint changes.

### Pull Request title guidelines

This allows the commit to be easier
to read on GitHub as well as in various git tools.

Samples: (even more [samples](https://github.com/analogjs/analog/commits/beta))

```
feat(content): update prismjs to latest version
```

```
fix(content): fix error when rendering markdown
```

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

- **astro-angular**
- **content**
- **content-plugin**
- **create-analog**
- **nx-plugin**
- **platform**
- **router**
- **trpc**
- **vite-plugin-angular**
- **vite-plugin-nitro**
- **vitest-angular**

### Breaking Changes

If any breaking changes are included, they should be explained in the body of the pull request.

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

## Submitting bug reports

- Search through issues to see if a previous issue has already been reported and/or fixed.
- Provide a _small_ reproduction using a [StackBlitz project](https://analogjs.org/new) or a GitHub repository.
- Please detail the affected browser(s) and operating system(s).
- Please be sure to state which version of Angular, node, and package manager (npm, pnpm, yarn) you're using.

## Submitting new features

- We value keeping the API surface small and concise, which factors into whether new features are accepted.
- Submit an issue with the prefix `Feature:` with your feature request. Use the `RFC:` prefix for a large feature with bigger impact to the codebase.
- The feature will be discussed and considered.
- After the PR is submitted, reviewed and approved, it will be merged.

## Questions and requests for support

Questions and requests for support should not be opened as issues and should be handled in the following ways:

- Start a new [Q&A Discussion](https://github.com/analogjs/analog/discussions/new?category=q-a) on GitHub.
- Start a new thread in the `#help` forum on the [Discord server](https://chat.analogjs.org/)
