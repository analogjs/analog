import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true,
  imports: [RouterLink],
  template: `
    <section class="mx-auto max-w-3xl px-6 py-16 text-center">
      <h1 class="text-4xl font-bold">Analog</h1>
      <p class="mt-3 text-lg text-gray-600">
        The fullstack Angular meta-framework
      </p>
      <a
        routerLink="/docs"
        class="mt-8 inline-block rounded bg-blue-600 px-5 py-2 text-white"
        >Read the docs</a
      >
    </section>
  `,
})
export default class HomePage {}
