# 表单服务器操作

Analog 支持服务器端处理表单提交和验证。

<div className="video-container">
  <div className="video-responsive-wrapper">
    <iframe
      width="560"
      height="315"
      src="https://www.youtube.com/embed/4pFPO1OpD4Q?si=HcESaJI03LgEljpQ&amp;controls=0">
    </iframe>
  </div>
</div>

## 设置表单

要处理表单提交，请使用 `@analogjs/router` 包中的 `FormAction` 指令。该指令处理收集 `FormData` 并发送 `POST` 请求到服务器。

该指令在处理表单后会触发以下事件：

- `onSuccess`：当表单在服务器上处理并返回成功响应时触发。
- `onError`：当表单返回错误响应时触发。
- `onStateChange`：当表单提交时触发。

下面的示例页面提交一个电子邮件用于新闻通讯注册。

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

`FormAction` 指令将表单数据提交到服务器，由其处理程序处理。

## 处理表单操作

要处理表单操作，请在包含异步 `action` 函数的 `.page.ts` 文件旁边定义 `.server.ts` 文件，以处理表单提交。

在服务器操作中，您可以使用访问环境变量、读取 cookie 和执行其他仅限服务器端的操作。

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

- `json` 函数返回 JSON 响应。
- `redirect` 函数返回重定向响应给客户端。这个路径应该是绝对路径。
- `fail` 函数用于返回表单验证错误。

### 处理多个表单

要在同一页面上处理多个表单，请添加一个隐藏输入以区分每个表单。

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

在服务器操作中，使用 `action` 值。

```ts
export async function action({ event }: PageServerAction) {
  const body = await readFormData(event);
  const action = body.get('action') as string;

  if (action === 'register') {
    // 处理注册表单
  }
}
```

## 处理 GET 请求

具有 `GET` 操作的表单可用于导航到相同的 URL，并将表单输入作为查询参数传递。

下面的示例定义了一个搜索表单，其中 `search` 字段作为查询参数。

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

可以通过服务器表单操作访问查询参数。

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
