import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Tests durchführen

Analog unterstützt [Vitest] (https://vitest.dev) zur Durchführung von Unit-Tests.

## Vitest Features

Vitest unterstützt viele Funktionen:

- Eine Jest-kompatible API.
- Unterstützt Vites Konfiguration, Transformationen, Resolver und Plugins.
- Smart & Instant Watch Modus.
- TypeScript-Unterstützung.
- Jest-kompatible Snapshots.
- jsdom für DOM Mocking.
- In-Source-Tests.
- Und mehr ...

## Durchführung von Unit-Tests

Um Unit-Tests durchzuführen, verwende den Befehl `test`:

<Tabs groupId="package-manager">
  <TabItem value="npm">

```shell
npm run test
```

  </TabItem>

  <TabItem label="Yarn" value="yarn">

```shell
yarn test
```

  </TabItem>

  <TabItem value="pnpm">

```shell
pnpm run test
```

  </TabItem>
</Tabs>

Es kann auch [Vitest](/docs/features/testing/vitest) zu einem bestehenden Projekt hinzufügt werden.

## Bekannte Einschränkungen

- Nur Globalen sind mit Zone.js gepatcht. Das bedeutet, dass wenn `it`, `describe` etc. direkt aus `vitest` importiert wird, kann `fakeAsync` nicht ausgeführt werden. Verwende stattdessen die Funktionen (`it`, `describe` etc.) so, wie es in Jest/Jasmine getan wird - ohne Import dieser Funktionen in der Testdatei.
- `vmThreads` wird verwendet. Dies kann zu potentiellen Speicherlecks führen und wird standardmäßig verwendet, um eine Umgebung zu schaffen, die näher an Jest mit JSDOM ist. Weitere Details können unter [hier](https://github.com/vitest-dev/vitest/issues/4685) nachgelesen werden.

Um das zu ändern, passe die `vite.config.mts` an.

```typescript
export default defineConfig(({ mode }) => {
  return {
    test: {
      pool: 'threads', // add this property
    },
  };
});
```
