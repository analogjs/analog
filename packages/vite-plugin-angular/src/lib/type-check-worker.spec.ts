import { describe, it, expect } from 'vitest';
import { Worker } from 'node:worker_threads';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';
import type { SerializedDiagnostic } from './type-check-worker';

/**
 * Validation test suite for the parallel template type checker.
 *
 * Each test creates a minimal Angular project with an intentional error,
 * runs the type-check worker, and asserts the diagnostic output.
 */

const WORKER_PATH = path.resolve(
  __dirname,
  '../../../../node_modules/@analogjs/vite-plugin-angular/src/lib/type-check-worker.js',
);

interface WorkerResult {
  diagnostics: SerializedDiagnostic[];
  error?: string;
}

async function runTypeCheck(
  files: Record<string, string>,
  options: { scopedFile?: string } = {},
): Promise<WorkerResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'analog-typecheck-'));

  try {
    const workspaceRoot = path.resolve(__dirname, '../../../..');
    const tsconfig = {
      compilerOptions: {
        target: 'ES2022',
        module: 'ES2022',
        moduleResolution: 'bundler',
        experimentalDecorators: true,
        strict: true,
        skipLibCheck: true,
        lib: ['ES2022', 'DOM'],
        baseUrl: workspaceRoot,
        paths: {
          '@angular/*': ['node_modules/@angular/*'],
        },
      },
      files: Object.keys(files).map((f) => path.join(tmpDir, f)),
    };
    fs.writeFileSync(
      path.join(tmpDir, 'tsconfig.json'),
      JSON.stringify(tsconfig),
    );

    for (const [name, content] of Object.entries(files)) {
      const filePath = path.join(tmpDir, name);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content);
    }

    return await new Promise<WorkerResult>((resolve, reject) => {
      const worker = new Worker(WORKER_PATH);
      const timeout = setTimeout(() => {
        worker.terminate();
        reject(new Error('Worker timed out'));
      }, 30000);

      worker.on('message', (msg: any) => {
        if (msg.type === 'ready') {
          const checkMsg: { type: 'check'; files?: string[] } = {
            type: 'check',
          };
          if (options.scopedFile) {
            checkMsg.files = [path.join(tmpDir, options.scopedFile)];
          }
          worker.postMessage(checkMsg);
        } else if (msg.type === 'diagnostics') {
          clearTimeout(timeout);
          worker.postMessage({ type: 'shutdown' });
          resolve({ diagnostics: msg.diagnostics });
        } else if (msg.type === 'error') {
          clearTimeout(timeout);
          worker.postMessage({ type: 'shutdown' });
          resolve({ diagnostics: [], error: msg.message });
        }
      });

      worker.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });

      worker.postMessage({
        type: 'init',
        tsconfig: path.join(tmpDir, 'tsconfig.json'),
      });
    });
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// Skipped: zone.js loaded by the package's vitest setup patches MessagePort
// globally, which collides with `worker_threads.Worker` and crashes the spec
// before assertions can run. Unblock by running this spec under a vitest
// setup that doesn't import zone.js.
describe.skip('Type Check Worker Validation', () => {
  it('reports no errors for correct code', async () => {
    const result = await runTypeCheck({
      'app.ts': `
        import { Component } from '@angular/core';
        @Component({
          selector: 'app-root',
          standalone: true,
          template: '<p>{{ title }}</p>'
        })
        export class AppComponent {
          title = 'Hello';
        }
      `,
    });

    expect(
      result.diagnostics.filter((d) => d.category === 'error'),
    ).toHaveLength(0);
  });

  it('catches property access on wrong type', async () => {
    const result = await runTypeCheck({
      'app.ts': `
        import { Component } from '@angular/core';
        @Component({
          selector: 'app-root',
          standalone: true,
          template: '<p>{{ title.nonExistentMethod() }}</p>'
        })
        export class AppComponent {
          title = 'Hello';
        }
      `,
    });

    const errors = result.diagnostics.filter((d) => d.category === 'error');
    expect(errors.length).toBeGreaterThan(0);
    expect(errors.some((e) => e.message.includes('nonExistentMethod'))).toBe(
      true,
    );
  });

  it('catches unknown element in template', async () => {
    const result = await runTypeCheck({
      'app.ts': `
        import { Component } from '@angular/core';
        @Component({
          selector: 'app-root',
          standalone: true,
          template: '<nonexistent-component />'
        })
        export class AppComponent {}
      `,
    });

    const errors = result.diagnostics.filter((d) => d.category === 'error');
    expect(errors.length).toBeGreaterThan(0);
    expect(
      errors.some(
        (e) =>
          e.message.includes('nonexistent-component') ||
          e.message.includes('not a known element'),
      ),
    ).toBe(true);
  });

  it('catches unknown property binding', async () => {
    const result = await runTypeCheck({
      'child.ts': `
        import { Component } from '@angular/core';
        @Component({
          selector: 'app-child',
          standalone: true,
          template: '<p>child</p>'
        })
        export class ChildComponent {}
      `,
      'app.ts': `
        import { Component } from '@angular/core';
        import { ChildComponent } from './child';
        @Component({
          selector: 'app-root',
          standalone: true,
          imports: [ChildComponent],
          template: '<app-child [unknownProp]="123" />'
        })
        export class AppComponent {}
      `,
    });

    const errors = result.diagnostics.filter((d) => d.category === 'error');
    expect(errors.length).toBeGreaterThan(0);
    expect(
      errors.some(
        (e) =>
          e.message.includes('unknownProp') ||
          e.message.includes('not a known property'),
      ),
    ).toBe(true);
  });

  it('reports diagnostics for the scoped file when files filter is provided', async () => {
    const result = await runTypeCheck(
      {
        'app.ts': `
          import { Component } from '@angular/core';
          @Component({
            selector: 'app-root',
            standalone: true,
            template: '<p>{{ title.nonExistentMethod() }}</p>'
          })
          export class AppComponent {
            title = 'Hello';
          }
        `,
      },
      { scopedFile: 'app.ts' },
    );

    const errors = result.diagnostics.filter((d) => d.category === 'error');
    expect(errors.some((e) => e.message.includes('nonExistentMethod'))).toBe(
      true,
    );
  });

  it('accepts valid input binding', async () => {
    const result = await runTypeCheck({
      'child.ts': `
        import { Component, Input } from '@angular/core';
        @Component({
          selector: 'app-child',
          standalone: true,
          template: '<p>{{ name }}</p>'
        })
        export class ChildComponent {
          @Input() name = '';
        }
      `,
      'app.ts': `
        import { Component } from '@angular/core';
        import { ChildComponent } from './child';
        @Component({
          selector: 'app-root',
          standalone: true,
          imports: [ChildComponent],
          template: '<app-child [name]="title" />'
        })
        export class AppComponent {
          title = 'Hello';
        }
      `,
    });

    const errors = result.diagnostics.filter((d) => d.category === 'error');
    expect(errors.filter((e) => e.message.includes('name'))).toHaveLength(0);
  });
});
