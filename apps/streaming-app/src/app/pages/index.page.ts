import { Component, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

import { FastA } from '../blocks/fast-a.component';
import { SlowB } from '../blocks/slow-b.component';
import { ShellStatus } from '../blocks/shell-status.component';
import { TriggerC } from '../blocks/trigger-c.component';

@Component({
  selector: 'streaming-home',
  standalone: true,
  imports: [FastA, SlowB, ShellStatus, TriggerC],
  template: `
    <h1 class="shell-heading">Analog Streaming SSR</h1>
    <p class="static-shell">
      The document head streams first, then each &#64;defer block streams as it
      resolves; this shell and the eager component below arrive with the
      authoritative tail.
    </p>

    <!-- Eager, non-deferred component: hydrates immediately. -->
    <app-shell-status />

    <!-- Deferred + fast: no async data, resolves instantly. -->
    @defer (hydrate on immediate) {
      <app-fast-a />
    } @placeholder {
      <p class="ph-a">Loading A…</p>
    }

    <!-- Deferred + slow: httpResource against a ~600ms API route. -->
    @defer (hydrate on immediate) {
      <app-slow-b />
    } @placeholder {
      <p class="ph-b">Loading B…</p>
    }

    <!-- Deferred + non-immediate trigger: stays dormant until interaction. -->
    @defer (hydrate on interaction) {
      <app-trigger-c />
    } @placeholder {
      <p class="ph-c">Loading C…</p>
    }
  `,
})
export default class IndexPage {
  // Set the head dynamically *during* render. The streaming shell head was
  // already flushed by this point, so this exercises the finalize-time head
  // reconcile (see __analogReconcileHead): the title/meta below must appear in
  // the live document even though they were unknown when the head streamed.
  constructor() {
    inject(Title).setTitle('Streamed dynamically — Analog SSR');
    inject(Meta).updateTag({
      name: 'description',
      content: 'Head set during render, reconciled after the stream.',
    });
  }
}
