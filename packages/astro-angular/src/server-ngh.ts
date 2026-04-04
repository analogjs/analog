import { readFile, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import type { EnvironmentProviders, Provider, Type } from '@angular/core';
import {
  reflectComponentType,
  provideZonelessChangeDetection,
  DOCUMENT,
  APP_ID,
} from '@angular/core';
import {
  provideServerRendering,
  renderApplication,
  ɵSERVER_CONTEXT,
  platformServer,
} from '@angular/platform-server';
import {
  bootstrapApplication,
  type HydrationFeature,
  type HydrationFeatureKind,
  provideClientHydration,
  type BootstrapContext,
} from '@angular/platform-browser';
import type { AstroComponentMetadata, SSRLoadedRendererValue } from 'astro';
import { getContext, incrementId, type RendererContext } from './context.ts';
import { provideBootstrapListener } from './server-providers.ts';
import { ID_PROP_NAME } from './id.ts';

const require = createRequire(import.meta.url);
let jsActionContractScript: string | undefined = undefined;

const HYDRATION_SCRIPT_ID = 'ng-event-dispatch-contract';

function getHydrationScript(): string {
  jsActionContractScript ??=
    `<script type="text/javascript" id="${HYDRATION_SCRIPT_ID}">` +
    readFileSync(
      require.resolve('@angular/core/event-dispatch-contract.min.js'),
      'utf-8',
    ) +
    '</script>';
  return jsActionContractScript;
}

async function check(Component: Type<unknown>) {
  return !!reflectComponentType(Component);
}

async function renderToStaticMarkup(
  this: RendererContext,
  Component: Type<unknown> & {
    renderProviders?: (Provider | EnvironmentProviders)[];
    hydrationFeatures?: () => HydrationFeature<HydrationFeatureKind>[];
  },
  props: Record<string, unknown>,
  _children: unknown,
  metadata?: AstroComponentMetadata,
) {
  const mirror = reflectComponentType(Component);

  if (!mirror) {
    // This should be unreachable: the `check` function verifies that Component is an Angular component.
    throw new Error(
      (metadata?.displayName || '<unknown component>') +
        ' is not an Angular component',
    );
  }

  const appId =
    mirror.selector.split(',')[0] || Component.name.toString().toLowerCase();
  const ngAppId = props?.[ID_PROP_NAME] || incrementId(getContext(this.result));

  const platformRef = platformServer();
  const document = platformRef.injector.get(DOCUMENT);

  // Incremental hydration requires the event dispatch script to be present.
  document.body.innerHTML = `${getHydrationScript()}<${appId} ${ID_PROP_NAME}="${ngAppId}"></${appId}>`;

  const bootstrap = (context?: BootstrapContext) =>
    bootstrapApplication(
      Component,
      {
        providers: [
          provideBootstrapListener(mirror, props),
          provideServerRendering(),
          { provide: ɵSERVER_CONTEXT, useValue: 'analog' },
          provideZonelessChangeDetection(),
          metadata?.hydrate
            ? provideClientHydration(...(Component.hydrationFeatures?.() || []))
            : [],
          {
            provide: APP_ID,
            useValue: ngAppId,
          },
          ...(Component.renderProviders || []),
        ],
      },
      context,
    );

  const html = await renderApplication(bootstrap, {
    document,
  });

  // Since astro renders components in parallel, we must reset the ngServerMode global to `true` after rendering the component.
  // The `renderApplication` function resets this back to `undefined` before returning.
  globalThis.ngServerMode = true;

  document.documentElement.innerHTML = html;
  let styleTags = '';

  document.head.childNodes.forEach((node) => {
    if (node.nodeName === 'STYLE') {
      styleTags += (node as HTMLElement).outerHTML;
    }
  });

  // Remove the hydration script, so only one is present on the page.
  document.getElementById(HYDRATION_SCRIPT_ID)?.remove();

  const correctedHtml = styleTags + document.body.innerHTML;

  platformRef.destroy();

  return { html: correctedHtml };
}

export default {
  check,
  renderToStaticMarkup,
  renderHydrationScript: () => getHydrationScript(),
} satisfies SSRLoadedRendererValue;
