# create-analog

## Scaffolding Your First Analog Project

With NPM:

```bash
$ npm create analog@latest
```

With Yarn:

```bash
$ yarn create analog
```

With PNPM:

```bash
$ pnpm create analog
```

Then follow the prompts!

You can also directly specify the project name and the template you want to use via additional command line options. For example, to scaffold an Angular, run:

```bash
# npm 6.x
npm create analog@latest my-angular-app --template angular-v14

# npm 7+, extra double-dash is needed:
npm create analog@latest my-angular-app -- --template angular-v14

# yarn
yarn create analog my-angular-app --template angular-v14

# pnpm
pnpm create analog my-angular-app --template angular-v14
```

Currently supported template presets include:

- `angular-v14`
- `angular-v14-standalone`

You can use `.` for the project name to scaffold in the current directory.

## Credits

This project is inspired by `create-vite`.