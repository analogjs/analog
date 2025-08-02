import { ApplicationConfig, Type } from '@angular/core';
import { bootstrapApplication } from '@angular/platform-browser';
import {
  reflectComponentType,
  ɵConsole as Console,
  APP_ID,
} from '@angular/core';
import {
  provideServerRendering,
  renderApplication,
  ɵSERVER_CONTEXT as SERVER_CONTEXT,
} from '@angular/platform-server';
import { ServerContext } from '@analogjs/router/tokens';
import { mockEvent, readBody } from 'h3';

import { provideStaticProps } from './tokens';

type ComponentLoader = () => Promise<Type<unknown>>;

export function serverComponentRequest(serverContext: ServerContext) {
  // For now, skip h3 utilities as mockEvent doesn't work with IncomingMessage
  const serverComponentId = serverContext.req.headers[
    'x-analog-component'
  ] as string;

  if (
    !serverComponentId &&
    serverContext.req.url &&
    serverContext.req.url.startsWith('/_analog/components')
  ) {
    const componentId = serverContext.req.url.split('/')?.[3];

    return componentId;
  }

  return serverComponentId;
}

const components = import.meta.glob([
  '/src/server/components/**/*.{ts,analog,ag}',
]);

export async function renderServerComponent(
  url: string,
  serverContext: ServerContext,
  config?: ApplicationConfig,
) {
  const componentReqId = serverComponentRequest(serverContext) as string;
  const { componentLoader, componentId } = getComponentLoader(componentReqId);

  if (!componentLoader) {
    return new Response(`Server Component Not Found ${componentId}`, {
      status: 404,
    });
  }

  const component = ((await componentLoader()) as any)[
    'default'
  ] as Type<unknown>;

  if (!component) {
    return new Response(`No default export for ${componentId}`, {
      status: 422,
    });
  }

  const mirror = reflectComponentType(component);
  const selector = mirror?.selector.split(',')?.[0] || 'server-component';
  // For now, skip h3 utilities as mockEvent doesn't work with IncomingMessage
  const body = {};
  const appId = `analog-server-${selector.toLowerCase()}-${new Date().getTime()}`;

  const bootstrap = () =>
    bootstrapApplication(component, {
      providers: [
        provideServerRendering(),
        provideStaticProps(body),
        { provide: SERVER_CONTEXT, useValue: 'analog-server-component' },
        {
          provide: APP_ID,
          useFactory() {
            return appId;
          },
        },
        ...(config?.providers || []),
      ],
    });

  const html = await renderApplication(bootstrap, {
    url,
    document: `<${selector}></${selector}>`,
    platformProviders: [
      {
        provide: Console,
        useFactory() {
          return {
            warn: () => undefined,
            log: () => undefined,
          };
        },
      },
    ],
  });

  const outputs = retrieveTransferredState(html, appId);
  const responseData: { html: string; outputs: Record<string, any> } = {
    html,
    outputs,
  };

  return new Response(JSON.stringify(responseData), {
    headers: {
      'X-Analog-Component': 'true',
    },
  });
}

function getComponentLoader(componentReqId: string): {
  componentLoader: ComponentLoader | undefined;
  componentId: string;
} {
  const _componentId = `/src/server/components/${componentReqId.toLowerCase()}`;
  let componentLoader: ComponentLoader | undefined = undefined;
  let componentId = _componentId;

  if (components[`${_componentId}.ts`]) {
    componentId = `${_componentId}.ts`;
    componentLoader = components[componentId] as ComponentLoader;
  } else if (components[`${componentId}.analog`]) {
    componentId = `${_componentId}.analog`;
    componentLoader = components[componentId] as ComponentLoader;
  } else if (components[`${componentId}.ag`]) {
    componentId = `${_componentId}.ag`;
    componentLoader = components[componentId] as ComponentLoader;
  }

  return { componentLoader, componentId };
}

function retrieveTransferredState(
  html: string,
  appId: string,
): Record<string, unknown | undefined> {
  const regex = new RegExp(
    `<script id="${appId}-state" type="application/json">(.*?)</script>`,
  );
  const match = html.match(regex);

  if (match) {
    const scriptContent = match[1];

    if (scriptContent) {
      try {
        const parsedContent: {
          _analog_output: Record<string, unknown | undefined>;
        } = JSON.parse(scriptContent);
        return parsedContent._analog_output || {};
      } catch (e) {
        console.warn('Exception while parsing static outputs for ' + appId, e);
      }
    }

    return {};
  } else {
    return {};
  }
}
