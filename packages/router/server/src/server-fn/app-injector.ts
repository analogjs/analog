import { Injector, type StaticProvider } from '@angular/core';
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
 * No root component is bootstrapped (`createApplication`, not
 * `bootstrapApplication`), so nothing renders and no change detection runs — it
 * is a DI container with the app's providers, built once and reused for the
 * process, with only `REQUEST`/`RESPONSE` rebuilt per call in the child.
 */
export async function createServerFnAppInjector(
  providers: StaticProvider[] = [],
): Promise<Injector> {
  const platformRef = platformServer();
  const appRef = await createApplication(
    { providers: [provideServerRendering(), ...providers] },
    { platformRef },
  );
  return appRef.injector;
}
