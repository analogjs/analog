# Executando testes

O Analog utiliza [Vitest](https://vitest.dev) para testes unitários. Os modelos
atuais utilizam Vitest 5; modelos vinculados a versões específicas do Angular
mantêm suas versões anteriores.

Vitest 5 requer Node.js 22.12+ e Vite 6.4+. Verifique também os requisitos da
versão do Angular instalada no projeto.

```sh
pnpm exec vitest run
```

Para acompanhar alterações durante o desenvolvimento:

```sh
pnpm exec vitest
```

Ignore o diretório `.vitest/`, utilizado para relatórios e anexos. Mantenha
`vitest` e seus pacotes `@vitest/*` na mesma versão. Consulte o
[guia de configuração](/docs/features/testing/vitest) para integrar o executor
a um projeto Angular CLI ou Nx existente.
