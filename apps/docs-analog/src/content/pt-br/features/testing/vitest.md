# Usando Vitest em um projeto Angular

O pacote `@analogjs/vitest-angular` integra o Vitest aos projetos Angular CLI e
Nx. A integração adiciona suporte ao Vitest 5 e mantém os intervalos de peer
dependencies do Vitest 1–4.

## Configuração

Vitest 5 requer Node.js 22.12+ e Vite 6.4+. Em um projeto Angular existente,
instale a integração e execute o schematic:

```sh
pnpm add -D @analogjs/vitest-angular
pnpm exec ng g @analogjs/vitest-angular:setup --project app
pnpm exec ng test app --watch=false
```

Na raiz de um workspace pnpm, utilize `pnpm add -w -D` para instalar a
dependência. O schematic seleciona versões compatíveis dos pacotes de teste e
cria a configuração do projeto. Para testes no navegador, adicione
`--browserMode` ao comando do schematic e instale os navegadores:

```sh
pnpm exec playwright install chromium
```

## Migração para Vitest 5

- Mantenha `vitest` e os pacotes `@vitest/*` na mesma versão. Modelos vinculados
  a versões específicas do Angular mantêm suas versões anteriores.
- Ignore `.vitest/`, onde ficam relatórios e anexos. Configure a transformação
  do Vite com `cacheDir` no nível superior, sem `test.cache` ou `test.cacheDir`.
- `clearMocks` fica ativo por padrão. Prepare os mocks em cada teste e mantenha
  `vi.mock`, `vi.unmock` e `vi.hoisted` no nível superior do módulo.
- Aguarde as asserções de promessas. Comparações de texto no navegador são
  exatas; utilize `toMatchTextContent` para trechos ou expressões regulares.
- Abra a interface do Vitest pela URL autenticada exibida pelo executor.

Consulte o [guia de migração do Vitest 5](https://vitest.dev/guide/migration/)
para as demais mudanças. Outros executores, incluindo o `unit-test` nativo do
Angular, podem ter intervalos de compatibilidade diferentes.
