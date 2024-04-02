import { CompilerHost } from '@angular/compiler-cli';
import { normalizePath } from '@ngtools/webpack/src/ivy/paths.js';
import { readFileSync } from 'node:fs';
import * as ts from 'typescript';
import { compileAnalogFile } from './authoring/analog.js';
import { TEMPLATE_TAG_REGEX } from './authoring/constants.js';
import { MarkdownTemplateTransform } from './authoring/markdown-transform.js';

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export function augmentHostWithResources(
  host: ts.CompilerHost,
  transform: (
    code: string,
    id: string,
    options?: { ssr?: boolean }
  ) => ReturnType<any> | null,
  options: {
    inlineStylesExtension?: string;
    supportAnalogFormat?:
      | boolean
      | {
          include: string[];
        };

    isProd?: boolean;
    markdownTemplateTransforms?: MarkdownTemplateTransform[];
  } = {}
) {
  const ts = require('typescript');
  const resourceHost = host as CompilerHost;
  const baseGetSourceFile = (
    resourceHost as ts.CompilerHost
  ).getSourceFile.bind(resourceHost);

  if (options.supportAnalogFormat) {
    (resourceHost as ts.CompilerHost).getSourceFile = (
      fileName,
      languageVersionOrOptions,
      onError,
      ...parameters
    ) => {
      if (fileName.endsWith('.analog.ts') || fileName.endsWith('.agx.ts')) {
        const contents = readFileSync(
          fileName.replace('.analog.ts', '.analog').replace('.agx.ts', '.agx'),
          'utf-8'
        );
        const source = compileAnalogFile(fileName, contents, options.isProd);

        return ts.createSourceFile(
          fileName,
          source,
          languageVersionOrOptions,
          onError as any,
          ...(parameters as any)
        );
      }

      return baseGetSourceFile.call(
        resourceHost,
        fileName,
        languageVersionOrOptions,
        onError,
        ...parameters
      );
    };

    const baseReadFile = (resourceHost as ts.CompilerHost).readFile;

    (resourceHost as ts.CompilerHost).readFile = function (fileName: string) {
      if (fileName.includes('virtual-analog:')) {
        const filePath = fileName.split('virtual-analog:')[1];
        const fileContent =
          baseReadFile.call(resourceHost, filePath) ||
          'No Analog Markdown Content Found';

        // eslint-disable-next-line prefer-const
        const templateContent =
          TEMPLATE_TAG_REGEX.exec(fileContent)?.pop()?.trim() || '';

        return templateContent;
      }

      return baseReadFile.call(resourceHost, fileName);
    };

    const fileExists = (resourceHost as ts.CompilerHost).fileExists;

    (resourceHost as ts.CompilerHost).fileExists = function (fileName: string) {
      if (
        fileName.includes('virtual-analog:') &&
        !fileName.endsWith('analog.d') &&
        !fileName.endsWith('agx.d')
      ) {
        return true;
      }

      return fileExists.call(resourceHost, fileName);
    };
  }

  resourceHost.readResource = async function (fileName: string) {
    const filePath = normalizePath(fileName);

    let content = (this as any).readFile(filePath);

    if (content === undefined) {
      throw new Error('Unable to locate component resource: ' + fileName);
    }

    if (fileName.includes('virtual-analog:')) {
      for (const transform of options.markdownTemplateTransforms || []) {
        content = await transform(content, fileName);
      }
    }

    return content;
  };

  resourceHost.transformResource = async function (data, context) {
    // Only style resources are supported currently
    if (context.type !== 'style') {
      return null;
    }

    if (options.inlineStylesExtension) {
      // Resource file only exists for external stylesheets
      const filename =
        context.resourceFile ??
        `${context.containingFile.replace(/(\.analog)?\.ts$/, (...args) => {
          // NOTE: if the original file name contains `.analog`, we turn that into `-analog.css`
          if (args.includes('.analog') || args.includes('.agx')) {
            return `-analog.${options?.inlineStylesExtension}`;
          }
          return `.${options?.inlineStylesExtension}`;
        })}`;

      let stylesheetResult;

      try {
        stylesheetResult = await transform(data, `${filename}?direct`);
      } catch (e) {
        console.error(`${e}`);
      }

      return { content: stylesheetResult?.code || '' };
    }

    return null;
  };
}
