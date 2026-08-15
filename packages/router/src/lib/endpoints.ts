import { InjectionToken } from '@angular/core';

export const ANALOG_META_KEY = Symbol(
  '@analogjs/router Analog Route Metadata Key',
);

/**
 * This variable reference is replaced with a glob of all route endpoints.
 */
export let ANALOG_PAGE_ENDPOINTS: any = {};

/**
 * Page endpoint keys provided explicitly for build integrations that
 * cannot inject the endpoint glob into this package's module graph
 * (e.g. esbuild-based builds). Provided via withPageEndpoints.
 */
export const PAGE_ENDPOINTS = new InjectionToken<Record<string, unknown>>(
  '@analogjs/router Page Endpoints',
);
