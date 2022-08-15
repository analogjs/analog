# Targets

## e2e

### Ideal setup

Ideally, we would configure our `analog-app-e2e:e2e` target like so:

```json
{
  "targets": {
    "e2e": {
      "executor": "@nrwl/cypress:cypress",
      "options": {
        "cypressConfig": "apps/analog-app-e2e/cypress.json",
        "devServerTarget": "analog-app:serve"
      }
    }
  }
}
```

where the `analog-app:serve` target is:

```json
{
  "targets": {
    "serve": {
      "executor": "nx:run-commands",
      "options": {
        "cwd": "apps/analog-app",
        "command": "vite --strict-port"
      }
    }
  }
}
```

However, Nx and/or `@nrwl/cypress:cypress` doesn't seem to be able to detect:

- When the Vite development server is running
- The port the development server is exposed on

Both of these are detected when using `@angular-devkit/build-angular:dev-server` with `@nrwl/cypress:cypress` in regular Angular workspaces.

### start-server-and-test

The [`start-server-and-test`](https://www.npmjs.com/package/start-server-and-test) package is created exactly for this scenario.

We can configure a `analog-app-e2e:cypress` target that uses the `@nrwl/cypress:cypress` executor but expects the development server to already be running. We then use `start-server-and-test` in the `analog-app-e2e:e2e` target to start the `analog-app:serve` target and wait for it to respond on port 3000 before starting the `analog-app-e2e:cypress` target.

```json
{
  "targets": {
    "e2e": {
      "executor": "nx:run-commands",
      "options": {
        "cwd": "",
        "command": "start-server-and-test 'nx serve analog-app' 3000 'nx cypress analog-app-e2e'"
      }
    },
    "cypress": {
      "executor": "@nrwl/cypress:cypress",
      "options": {
        "cypressConfig": "apps/analog-app-e2e/cypress.json",
        "baseUrl": "http://localhost:3000"
      }
    }
  }
}
```

where the `analog-app:serve` target is:

```json
{
  "targets": {
    "serve": {
      "executor": "nx:run-commands",
      "options": {
        "cwd": "apps/analog-app",
        "command": "vite --strict-port"
      }
    }
  }
}
```

`start-server-and-test` kills both processes both on success and failure.

### Using a separate serve target

Without the `start-server-and-test` package, we can specify the `baseUrl` option for the `@nrwl/cypress:cypress` executor and use a separate `analog-app:e2e` target:

```json
{
  "targets": {
    "e2e": {
      "executor": "@nrwl/cypress:cypress",
      "options": {
        "cypressConfig": "apps/analog-app-e2e/cypress.json",
        "devServerTarget": "analog-app:e2e",
        "baseUrl": "http://localhost:3000"
      }
    }
  }
}
```

where the `analog-app:e2e` target is:

```json
{
  "targets": {
    "e2e": {
      "executor": "nx:run-commands",
      "options": {
        "color": true,
        "commands": ["vite --strict-port"],
        "cwd": "apps/analog-app",
        "parallel": true,
        "readyWhen": "ready in"
      }
    }
  }
}
```

The tests run but the development server isn't killed after success or failure.
