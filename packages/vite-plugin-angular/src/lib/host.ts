import { CompilerHost } from '@angular/compiler-cli';
import { normalizePath } from 'vite';

import { readFileSync } from 'node:fs';
import * as ts from 'typescript';
import { compileAnalogFile } from './authoring/analog.js';
import {
  FRONTMATTER_REGEX,
  TEMPLATE_TAG_REGEX,
} from './authoring/constants.js';
import { MarkdownTemplateTransform } from './authoring/markdown-transform.js';

import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);

export function augmentHostWithResources(
  host: ts.CompilerHost,
  transform: (
    code: string,
    id: string,
    options?: { ssr?: boolean }
  ) => ReturnType<any> | null,
  options: {
    inlineStylesExtension: string;
    supportAnalogFormat?:
      | boolean
      | {
          include: string[];
        };

    isProd?: boolean;
    markdownTemplateTransforms?: MarkdownTemplateTransform[];
    inlineComponentStyles?: Map<string, string>;
  }
) {
  const ts = require('typescript');
  const resourceHost = host as CompilerHost;
  const baseGetSourceFile = (
    resourceHost as ts.CompilerHost
  ).getSourceFile.bind(resourceHost);
  const externalStylesheets = new Map<string, string>();

  if (options.supportAnalogFormat) {
    (resourceHost as ts.CompilerHost).getSourceFile = (
      fileName,
      languageVersionOrOptions,
      onError,
      ...parameters
    ) => {
      if (
        fileName.endsWith('.analog.ts') ||
        fileName.endsWith('.agx.ts') ||
        fileName.endsWith('.ag.ts')
      ) {
        const contents = readFileSync(
          fileName
            .replace('.analog.ts', '.analog')
            .replace('.agx.ts', '.agx')
            .replace('.ag.ts', '.ag'),
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

        const frontmatterContent = FRONTMATTER_REGEX.exec(fileContent)
          ?.pop()
          ?.trim();

        if (frontmatterContent) {
          return frontmatterContent + '\n\n' + templateContent;
        }

        return templateContent;
      }

      return baseReadFile.call(resourceHost, fileName);
    };

    const fileExists = (resourceHost as ts.CompilerHost).fileExists;

    (resourceHost as ts.CompilerHost).fileExists = function (fileName: string) {
      if (
        fileName.includes('virtual-analog:') &&
        !fileName.endsWith('analog.d') &&
        !fileName.endsWith('agx.d') &&
        !fileName.endsWith('ag.d')
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
        content = String(await transform(content, fileName));
      }
    }

    return content;
  };

  resourceHost.transformResource = async function (data, context) {
    // Only style resources are supported currently
    if (context.type !== 'style') {
      return null;
    }

    if (options.inlineComponentStyles) {
      const id = createHash('sha256')
        .update(context.containingFile)
        .update(context.className)
        .update(String(context.order))
        .update(data)
        .digest('hex');
      const filename = id + '.' + options.inlineStylesExtension;
      options.inlineComponentStyles.set(filename, data);
      return { content: filename };
    }

    // Resource file only exists for external stylesheets
    const filename =
      context.resourceFile ??
      `${context.containingFile.replace(/(\.analog|\.ag)?\.ts$/, (...args) => {
        // NOTE: if the original file name contains `.analog`, we turn that into `-analog.css`
        if (
          args.includes('.analog') ||
          args.includes('.ag') ||
          args.includes('.agx')
        ) {
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

    return null;
  };
}

export function augmentProgramWithVersioning(program: ts.Program): void {
  const baseGetSourceFiles = program.getSourceFiles;
  program.getSourceFiles = function (...parameters) {
    const files: readonly (ts.SourceFile & { version?: string })[] =
      baseGetSourceFiles(...parameters);

    for (const file of files) {
      if (file.version === undefined) {
        file.version = createHash('sha256').update(file.text).digest('hex');
      }
    }

    return files;
  };
}

export function augmentHostWithCaching(
  host: ts.CompilerHost,
  cache: Map<string, ts.SourceFile>
): void {
  const baseGetSourceFile = host.getSourceFile;
  host.getSourceFile = function (
    fileName,
    languageVersion,
    onError,
    shouldCreateNewSourceFile,
    ...parameters
  ) {
    if (!shouldCreateNewSourceFile && cache.has(fileName)) {
      return cache.get(fileName);
    }

    const file = baseGetSourceFile.call(
      host,
      fileName,
      languageVersion,
      onError,
      true,
      ...parameters
    );

    if (file) {
      cache.set(fileName, file);
    }

    return file;
  };
}

export function mergeTransformers(
  first: ts.CustomTransformers,
  second: ts.CustomTransformers
): ts.CustomTransformers {
  const result: ts.CustomTransformers = {};

  if (first.before || second.before) {
    result.before = [...(first.before || []), ...(second.before || [])];
  }

  if (first.after || second.after) {
    result.after = [...(first.after || []), ...(second.after || [])];
  }

  if (first.afterDeclarations || second.afterDeclarations) {
    result.afterDeclarations = [
      ...(first.afterDeclarations || []),
      ...(second.afterDeclarations || []),
    ];
  }

  return result;
}
