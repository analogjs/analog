import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MINIMUM_SUPPORTED_ANGULAR_VERSION } from './versions';
import {
  MINIMUM_SUPPORTED_ANGULAR_VERSION as MIN_ANGULAR_GUARD,
  MINIMUM_SUPPORTED_NX_VERSION,
} from './versions/minimum-supported-versions';

const templatesDir = join(__dirname, 'files');

function readTemplateJson(templateName: string, fileName: string) {
  const raw = readFileSync(join(templatesDir, templateName, fileName), 'utf-8');
  // Replace EJS string values with placeholders so JSON.parse works.
  // Handles patterns like "<%= foo %><%= bar %>" → "__ejs__"
  const cleaned = raw.replace(/"[^"]*<%[^"]*"/g, '"__ejs__"');
  return JSON.parse(cleaned);
}

const versionedTemplates = readdirSync(templatesDir).filter((d) =>
  d.startsWith('template-angular'),
);

describe('generator templates', () => {
  describe.each(versionedTemplates)('%s tsconfig.json', (template) => {
    const tsconfig = readTemplateJson(template, 'tsconfig.json__template__');

    it('uses bundler module resolution', () => {
      expect(tsconfig.compilerOptions.moduleResolution).toBe('bundler');
    });

    it('targets ES2022 or higher', () => {
      const target = tsconfig.compilerOptions.target.toLowerCase();
      expect(['es2022', 'esnext']).toContain(target);
    });

    it('uses ES2022 or ESNext module', () => {
      const mod = tsconfig.compilerOptions.module.toLowerCase();
      expect(['es2022', 'esnext']).toContain(mod);
    });

    it('does not include baseUrl', () => {
      expect(tsconfig.compilerOptions.baseUrl).toBeUndefined();
    });

    it('does not include experimentalDecorators', () => {
      expect(tsconfig.compilerOptions.experimentalDecorators).toBeUndefined();
    });

    it('does not include emitDecoratorMetadata', () => {
      expect(tsconfig.compilerOptions.emitDecoratorMetadata).toBeUndefined();
    });
  });

  describe('root tsconfig.base.json', () => {
    const tsconfig = readTemplateJson('root', 'tsconfig.base.json');

    it('uses bundler module resolution', () => {
      expect(tsconfig.compilerOptions.moduleResolution).toBe('bundler');
    });

    it('targets esnext', () => {
      expect(tsconfig.compilerOptions.target.toLowerCase()).toBe('esnext');
    });

    it('uses esnext module', () => {
      expect(tsconfig.compilerOptions.module.toLowerCase()).toBe('esnext');
    });

    it('includes es2022 and dom in lib', () => {
      const lib = tsconfig.compilerOptions.lib.map((l: string) =>
        l.toLowerCase(),
      );
      expect(lib).toContain('es2022');
      expect(lib).toContain('dom');
    });

    it('does not include baseUrl', () => {
      expect(tsconfig.compilerOptions.baseUrl).toBeUndefined();
    });

    it('does not include experimentalDecorators', () => {
      expect(tsconfig.compilerOptions.experimentalDecorators).toBeUndefined();
    });

    it('does not include emitDecoratorMetadata', () => {
      expect(tsconfig.compilerOptions.emitDecoratorMetadata).toBeUndefined();
    });
  });

  describe('version constants', () => {
    it('minimum Angular version is consistent', () => {
      expect(MINIMUM_SUPPORTED_ANGULAR_VERSION).toBe(MIN_ANGULAR_GUARD);
    });

    it('minimum Nx version is at least 17', () => {
      expect(
        Number(MINIMUM_SUPPORTED_NX_VERSION.split('.')[0]),
      ).toBeGreaterThanOrEqual(17);
    });

    it('minimum Angular version is at least 17', () => {
      expect(
        Number(MINIMUM_SUPPORTED_ANGULAR_VERSION.split('.')[0]),
      ).toBeGreaterThanOrEqual(17);
    });
  });
});
