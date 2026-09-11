# Declarative Resource Tracking

Declarative resource tracking coordinates loading and error views for parts of
your page that depend on asynchronous data. Group related resources to reveal
their content together, or nest scopes so each section can show its content as
soon as it is ready.

Use `trackResource` to register an Angular resource with the nearest
`*untilSettled` view. The helper returns the original resource, preserving its
value, status, and reload APIs. It also works with `httpResource` and
`rxResource`.

Resource tracking builds on Angular's public resource and view APIs. Angular
resources require Angular 19 or later.

## Registering a resource

Call `trackResource` in an injection context, such as a component field
initializer:

```ts
import { Component } from '@angular/core';
import { httpResource } from '@angular/common/http';
import { trackResource } from '@analogjs/router';

@Component({
  selector: 'app-profile',
  standalone: true,
  template: `
    @if (profile.hasValue()) {
      <h2>{{ profile.value().name }}</h2>
    }
  `,
})
export class ProfileComponent {
  readonly profile = trackResource(
    httpResource<{ name: string }>(() => '/api/profile'),
  );
}
```

Configure `provideHttpClient()` in the application's providers when using
`httpResource`. Continue guarding reads with `hasValue()`: the content view
exists and updates while its fallback is visible.

Registration lasts until the injection context is destroyed. Outside a
`*untilSettled` scope, the helper returns the resource without registering it.
The helper does not create, destroy, fetch, or reload the resource itself.

## Loading and error templates

Import `UntilSettled` in the component that declares the directive:

```ts
import { Component } from '@angular/core';
import { UntilSettled } from '@analogjs/router';
import { ProfileComponent } from './profile.component';

@Component({
  standalone: true,
  imports: [UntilSettled, ProfileComponent],
  template: `
    <h1>Dashboard</h1>
    <app-profile *untilSettled="loading; error: failed" />

    <ng-template #loading>
      <p role="status">Loading profile…</p>
    </ng-template>
    <ng-template #failed>
      <p role="alert">Profile unavailable.</p>
    </ng-template>
  `,
})
export default class DashboardPage {}
```

The first template is displayed while registered resources are loading. The
error template receives the error as its implicit context (`let-error`). The
content is revealed after its resources stop loading and its view updates. An
idle resource does not keep the fallback visible.

A retry using the resource's existing `reload()` method can recover from an
error without recreating the component. Stale errors are ignored while the
resource is loading again. After a successful reveal, subsequent loads keep
the content view visible; its resource determines whether an old value remains
available. A subsequent failure selects the error template.

## Composing scopes

A shared scope waits for all resources registered by its descendants:

```html
<section *untilSettled="loading; error: failed">
  <app-profile />
  <app-activity />
</section>
```

Add an inner scope to let the parent reveal while the inner fallback remains:

```html
<section *untilSettled="loading; error: failed">
  <app-profile />
  <app-activity *untilSettled="activityLoading; error: activityFailed" />
</section>
```

Each registration belongs to the nearest scope. Inner loading does not delay
the parent. An inner error template handles its errors locally; otherwise,
errors propagate to the enclosing scope. If no scope handles an error, it is
reported to Angular's `ErrorHandler`. Fallback views use the enclosing scope,
so they do not register work against the content they replace. Keep fallback
templates lightweight and synchronous.

## Scope and rendering

Only explicitly registered resources participate. Plain promises, unrelated
HTTP calls, and unregistered resources are not discovered automatically. A
root service's resource can be registered from a consuming component with
`trackResource(inject(ProfileService).profile)`; registration then belongs to
that component's scope and lifetime.

The directive keeps pending content in a detached Angular host so its change
detection and resource loaders continue running. Removing the directive
destroys that content; resources created by the content retain Angular's
normal cancellation and cleanup behavior.

## Server rendering and streaming

With buffered SSR, Angular waits for application stability and sends resolved
content or an error view in the rendered document.

:::info Experimental SSR streaming

The progressive SSR integration is experimental, particularly its hydration
handoff. It uses Analog's experimental streaming configuration and its supported
Angular versions. Resource tracking can be used without enabling streaming.

:::

Enable [experimental streaming SSR](../server/streaming-ssr.md) to reveal scopes
progressively with the same directive and resource registrations:

```ts
analog({
  experimental: { streaming: true },
});
```

For the nested dashboard above, the response proceeds as follows:

1. The document head is sent immediately.
2. Once the page creates its scopes, the page shell is sent with the dashboard
   loading view.
3. When the profile settles, the dashboard replaces its loading view in place,
   including the activity loading view.
4. When activity settles, only its scope is replaced with content or its error
   view. A child that settles before its hidden parent is included when the
   parent reveals.
5. After server application stability, the final document and Angular's
   hydration data arrive. Angular hydrates a hidden copy while the preview
   remains visible, then reveals the live page after client stability.

Scope positions are represented by comments in copied HTML. No wrapper element
is added around the directive's content, and Angular's live server DOM is not
modified. Registrations and identifiers are local to each request.

Progressive content is a preview: it becomes interactive after client hydration
settles. This does not provide independent hydration of each scope,
and interactions with a preview are not guaranteed to survive finalization.
Changes outside registered scopes are reflected in the final document.

The existing crawler and route opt-outs continue to receive buffered HTML.
Handled resource failures select the error template; after streaming starts,
they cannot change the response's HTTP status.

`trackResource` does not transfer resource values or errors to the browser.
`httpResource` uses Angular's HTTP transfer cache when eligible, avoiding a
duplicate request after successful SSR. Failed HTTP responses are not cached
by that mechanism, so the client may load again during hydration. The preview
stays visible during this revalidation, preventing an error-to-loading flash.
