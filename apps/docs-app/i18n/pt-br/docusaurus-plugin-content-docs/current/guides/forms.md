# Ações de Formulários no Servidor

O Analog suporta manipulação do lado do servidor para envios e validação de formulários.

<div className="video-container">
  <div className="video-responsive-wrapper">
    <iframe
      width="560"
      height="315"
      src="https://www.youtube.com/embed/4pFPO1OpD4Q?si=HcESaJI03LgEljpQ&amp;controls=0">
    </iframe>
  </div>
</div>

## Configurando o Formulário

Para manipular envios de formulários, use a diretiva `FormAction` do pacote `@analogjs/router`. A diretiva manipula a coleta do `FormData` e envia uma requisição `POST` para o servidor.

A diretiva emite após processar o formulário:

- `onSuccess`: quando o formulário é processado no servidor e retorna uma resposta de sucesso.
- `onError`: quando o formulário retorna uma resposta de erro.
- `onStateChange`: quando o formulário é enviado.

A página de exemplo abaixo envia um e-mail para cadastro em newsletter.

```ts
// src/app/pages/newsletter.page.ts
import { Component, signal } from '@angular/core';

import { FormAction } from '@analogjs/router';

type FormErrors =
  | {
      email?: string;
    }
  | undefined;

@Component({
  selector: 'app-newsletter-page',
  standalone: true,
  imports: [FormAction],
  template: `
    <h3>Newsletter Signup</h3>

    @if (!signedUp()) {
      <form
        method="post"
        (onSuccess)="onSuccess()"
        (onError)="onError($any($event))"
        (onStateChange)="errors.set(undefined)"
      >
        <div>
          <label for="email"> Email </label>
          <input type="email" name="email" />
        </div>

        <button class="button" type="submit">Submit</button>
      </form>

      @if (errors()?.email) {
        <p>{{ errors()?.email }}</p>
      }
    } @else {
      <div>Thanks for signing up!</div>
    }
  `,
})
export default class NewsletterComponent {
  signedUp = signal(false);
  errors = signal<FormErrors>(undefined);

  onSuccess() {
    this.signedUp.set(true);
  }

  onError(result?: FormErrors) {
    this.errors.set(result);
  }
}
```

A diretiva `FormAction` envia os dados do formulário para o servidor, que são processados pelo seu manipulador.

## Manipulando a Ação do Formulário

Para manipular a ação do formulário, defina o arquivo `.server.ts` no mesmo diretório de `.page.ts`. O arquivo `.serve.ts` contém a função assíncrona `action` para processar o envio do formulário.

Na ação do servidor, você pode acessar variáveis de ambiente, ler cookies e executar outras operações exclusivas do lado do servidor.

```ts
// src/app/pages/newsletter.server.ts
import {
  type PageServerAction,
  redirect,
  json,
  fail,
} from '@analogjs/router/server/actions';
import { readFormData } from 'h3';

export async function action({ event }: PageServerAction) {
  const body = await readFormData(event);
  const email = body.get('email') as string;

  if (!email) {
    return fail(422, { email: 'Email is required' });
  }

  if (email.length < 10) {
    return redirect('/');
  }

  return json({ type: 'success' });
}
```

- A função `json` retorna uma resposta JSON.
- A função `redirect` retorna uma resposta de redirecionamento para o cliente. Este deve ser um caminho absoluto.
- A função `fail` é usada para retornar erros de validação de formulário.

### Manipulando Múltiplos Formulários

Para manipular múltiplos formulários na mesma página, adicione um input oculto para distinguir cada formulário.

```html
<form method="post">
  <div>
    <label for="email"> Email </label>
    <input type="email" name="email" />
  </div>

  <input type="hidden" name="action" value="register" />

  <button class="button" type="submit">Submit</button>
</form>
```

Na ação do servidor, use o valor de `action`.

```ts
export async function action({ event }: PageServerAction) {
  const body = await readFormData(event);
  const action = body.get('action') as string;

  if (action === 'register') {
    // processar formulário de registro
  }
}
```

## Manipulando Requisições GET

Formulários com uma ação `GET` podem ser usados para navegar para a mesma URL, com os inputs do formulário passados como parâmetros de consulta.

O exemplo abaixo define um formulário de busca com o campo `search` como parâmetro de consulta.

```ts
// src/app/pages/search.page.ts
import { Component, computed } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { injectLoad, FormAction } from '@analogjs/router';

import type { load } from './search.server';

@Component({
  selector: 'app-search-page',
  standalone: true,
  imports: [FormAction],
  template: `
    <h3>Search</h3>

    <form method="get">
      <div>
        <label for="search"> Search </label>
        <input type="text" name="search" [value]="searchTerm()" />
      </div>

      <button class="button" type="submit">Submit</button>
    </form>

    @if (searchTerm()) {
      <p>Search Term: {{ searchTerm() }}</p>
    }
  `,
})
export default class NewsletterComponent {
  loader = toSignal(injectLoad<typeof load>(), { requireSync: true });
  searchTerm = computed(() => this.loader().searchTerm);
}
```

O parâmetro de consulta pode ser acessado através da ação do formulário no servidor.

```ts
// src/app/pages/search.server.ts
import type { PageServerLoad } from '@analogjs/router';
import { getQuery } from 'h3';

export async function load({ event }: PageServerLoad) {
  const query = getQuery(event);
  console.log('loaded search', query['search']);

  return {
    loaded: true,
    searchTerm: `${query['search']}`,
  };
}
```
