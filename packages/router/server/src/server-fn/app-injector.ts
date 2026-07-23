import {
  type ApplicationConfig,
  Injector,
  type StaticProvider,
} from '@angular/core';
import { createApplication } from '@angular/platform-browser';
import {
  platformServer,
  provideServerRendering,
} from '@angular/platform-server';

/**
 * Builds the parent injector the server-function dispatch endpoint runs handlers
 * against, over HTTP.
 *
 * A plain `Injector.create({ providers })` resolves explicitly-listed providers
 * but not tree-shakeable `providedIn: 'root'` services — those attach to a
 * *bootstrapped* application's root injector, which `Injector.create` is not.
 * So the in-process SSR leg (whose parent is the app's own bootstrapped
 * injector) resolved `root` services while the HTTP leg did not — the same
 * handler could work while rendering and fail when called from the browser.
 *
 * Bootstrapping a real application on the server platform closes that gap: the
 * returned `appRef.injector` is a root environment injector, so both listed
 * providers and `providedIn: 'root'` services resolve, matching SSR.
 *
 * The generated endpoint passes the app's own server `ApplicationConfig` (the
 * one `main.server.ts` renders with), so a handler sees exactly the DI the app
 * configured — services, tokens, and interceptors alike — with no second
 * provider list to keep in sync. No root component is bootstrapped
 * (`createApplication`, not `bootstrapApplication`), so nothing renders, no
 * change detection runs, and the router registers but never navigates. It is a
 * DI container with the app's providers, built once and reused for the process,
 * with only `REQUEST`/`RESPONSE` rebuilt per call in the child.
 *
 * A bare provider array is also accepted (direct callers and tests without an
 * app config); it is wrapped with `provideServerRendering` so the server tokens
 * resolve the same way.
 */
export async function createServerFnAppInjector(
  configOrProviders: ApplicationConfig | StaticProvider[] = [],
): Promise<Injector> {
  const config: ApplicationConfig = Array.isArray(configOrProviders)
    ? { providers: [provideServerRendering(), ...configOrProviders] }
    : configOrProviders;

  const appRef = await createApplication(config, {
    platformRef: platformServer(),
  });
  return appRef.injector;
}
