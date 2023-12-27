import type { CompilerHost } from '@angular/compiler-cli';
import { normalizePath } from '@ngtools/webpack/src/ivy/paths';
import * as ts from 'typescript';
import * as fs from 'fs';

export function augmentHostWithResources(
  host: ts.CompilerHost,
  transform: (
    code: string,
    id: string,
    options?: { ssr?: boolean }
  ) => ReturnType<any> | null,
  options: {
    inlineStylesExtension?: string;
  } = {}
) {
  const resourceHost = host as CompilerHost;

  const baseGetSourceFile = (resourceHost as ts.CompilerHost).getSourceFile;

  (resourceHost as ts.CompilerHost).getSourceFile = (
    fileName,
    languageVersionOrOptions,
    onError,
    ...parameters
  ) => {
    if (fileName.includes('.ng')) {
      const contents = fs.readFileSync(
        fileName.replace('.ng.ts', '.ng'),
        'utf-8'
      );
      return ts.createSourceFile(
        fileName,
        `
          import { Component } from '@angular/core';
          
          @Component({
            selector: 'app-root',
            standalone: true,
            template: \`${contents}\`
          })
          export default class NgComponent {}
                      
          `,
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

  resourceHost.readResource = function (fileName: string) {
    const filePath = normalizePath(fileName);

    const content = (this as any).readFile(filePath);
    if (content === undefined) {
      throw new Error('Unable to locate component resource: ' + fileName);
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
        `${context.containingFile.replace(
          /\.ts$/,
          `.${options?.inlineStylesExtension}`
        )}`;

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
