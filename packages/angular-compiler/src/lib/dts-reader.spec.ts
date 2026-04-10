import { describe, it, expect } from 'vitest';
import {
  scanDtsFile,
  collectImportedPackages,
  collectRelativeReExports,
} from './dts-reader';

describe('scanDtsFile', () => {
  it('should extract directive inputs and outputs from ɵdir', () => {
    const dts = `
import * as i0 from "@angular/core";
declare class RouterLinkActive {
    routerLinkActiveOptions: { exact: boolean };
    static ɵfac: i0.ɵɵFactoryDeclaration<RouterLinkActive, never>;
    static ɵdir: i0.ɵɵDirectiveDeclaration<RouterLinkActive, "[routerLinkActive]", ["routerLinkActive"], { "routerLinkActiveOptions": { "alias": "routerLinkActiveOptions"; "required": false; }; "ariaCurrentWhenActive": { "alias": "ariaCurrentWhenActive"; "required": false; }; "routerLinkActive": { "alias": "routerLinkActive"; "required": false; }; }, { "isActiveChange": "isActiveChange"; }, ["links"], never, true, never>;
}
`;
    const entries = scanDtsFile(dts, 'router.d.ts');
    expect(entries).toHaveLength(1);
    expect(entries[0].selector).toBe('[routerLinkActive]');
    expect(entries[0].kind).toBe('directive');
    expect(entries[0].className).toBe('RouterLinkActive');
    expect(entries[0].inputs).toEqual({
      routerLinkActiveOptions: {
        classPropertyName: 'routerLinkActiveOptions',
        bindingPropertyName: 'routerLinkActiveOptions',
        isSignal: false,
        required: false,
      },
      ariaCurrentWhenActive: {
        classPropertyName: 'ariaCurrentWhenActive',
        bindingPropertyName: 'ariaCurrentWhenActive',
        isSignal: false,
        required: false,
      },
      routerLinkActive: {
        classPropertyName: 'routerLinkActive',
        bindingPropertyName: 'routerLinkActive',
        isSignal: false,
        required: false,
      },
    });
    expect(entries[0].outputs).toEqual({
      isActiveChange: 'isActiveChange',
    });
  });

  it('should extract component from ɵcmp', () => {
    const dts = `
import * as i0 from "@angular/core";
declare class MyComponent {
    static ɵcmp: i0.ɵɵComponentDeclaration<MyComponent, "my-comp", never, { "title": { "alias": "title"; "required": true; }; }, {}, never, never, true, never>;
}
`;
    const entries = scanDtsFile(dts, 'comp.d.ts');
    expect(entries).toHaveLength(1);
    expect(entries[0].selector).toBe('my-comp');
    expect(entries[0].kind).toBe('component');
    expect(entries[0].inputs!['title']).toEqual({
      classPropertyName: 'title',
      bindingPropertyName: 'title',
      isSignal: false,
      required: true,
    });
  });

  it('should extract pipe from ɵpipe', () => {
    const dts = `
import * as i0 from "@angular/core";
declare class AsyncPipe {
    static ɵfac: i0.ɵɵFactoryDeclaration<AsyncPipe, never>;
    static ɵpipe: i0.ɵɵPipeDeclaration<AsyncPipe, "async", true>;
}
`;
    const entries = scanDtsFile(dts, 'pipe.d.ts');
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('pipe');
    expect(entries[0].pipeName).toBe('async');
    expect(entries[0].selector).toBe('async');
  });

  it('should detect signal inputs with isSignal flag', () => {
    const dts = `
import * as i0 from "@angular/core";
declare class RouterOutlet {
    static ɵdir: i0.ɵɵDirectiveDeclaration<RouterOutlet, "router-outlet", ["outlet"], { "name": { "alias": "name"; "required": false; }; "routerOutletData": { "alias": "routerOutletData"; "required": false; "isSignal": true; }; }, { "activateEvents": "activate"; }, never, never, true, never>;
}
`;
    const entries = scanDtsFile(dts, 'outlet.d.ts');
    expect(entries).toHaveLength(1);
    expect(entries[0].inputs!['name'].isSignal).toBe(false);
    expect(entries[0].inputs!['routerOutletData'].isSignal).toBe(true);
  });

  it('should handle aliased inputs', () => {
    const dts = `
import * as i0 from "@angular/core";
declare class NgModel {
    static ɵdir: i0.ɵɵDirectiveDeclaration<NgModel, "[ngModel]", ["ngModel"], { "isDisabled": { "alias": "disabled"; "required": false; }; "model": { "alias": "ngModel"; "required": false; }; }, { "update": "ngModelChange"; }, never, never, false, never>;
}
`;
    const entries = scanDtsFile(dts, 'forms.d.ts');
    expect(entries).toHaveLength(1);
    expect(entries[0].inputs!['isDisabled'].bindingPropertyName).toBe(
      'disabled',
    );
    expect(entries[0].inputs!['model'].bindingPropertyName).toBe('ngModel');
    expect(entries[0].outputs!['update']).toBe('ngModelChange');
  });

  it('should skip files without Angular declarations', () => {
    const dts = `
export declare interface SomeInterface {
  foo: string;
}
`;
    const entries = scanDtsFile(dts, 'plain.d.ts');
    expect(entries).toHaveLength(0);
  });

  it('should handle multiple classes in one file', () => {
    const dts = `
import * as i0 from "@angular/core";
declare class DirectiveA {
    static ɵdir: i0.ɵɵDirectiveDeclaration<DirectiveA, "[dirA]", never, { "value": { "alias": "value"; "required": false; }; }, {}, never, never, true, never>;
}
declare class DirectiveB {
    static ɵdir: i0.ɵɵDirectiveDeclaration<DirectiveB, "[dirB]", never, {}, { "clicked": "clicked"; }, never, never, true, never>;
}
`;
    const entries = scanDtsFile(dts, 'multi.d.ts');
    expect(entries).toHaveLength(2);
    expect(entries[0].className).toBe('DirectiveA');
    expect(entries[1].className).toBe('DirectiveB');
  });
});

describe('.d.ts metadata extraction', () => {
  it('extracts directive with inputs/outputs from .d.ts', () => {
    const entries = scanDtsFile(
      `
import * as i0 from "@angular/core";
declare class MyDir {
    static ɵdir: i0.ɵɵDirectiveDeclaration<MyDir, "[myDir]", never, { "color": { "alias": "color"; "required": false; }; }, { "colorChange": "colorChange"; }, never, never, true, never>;
}
`,
      'my-dir.d.ts',
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].selector).toBe('[myDir]');
    expect(entries[0].kind).toBe('directive');
    expect(entries[0].inputs!['color'].bindingPropertyName).toBe('color');
    expect(entries[0].outputs!['colorChange']).toBe('colorChange');
  });

  it('extracts pipe name from .d.ts', () => {
    const entries = scanDtsFile(
      `
import * as i0 from "@angular/core";
declare class CurrencyPipe {
    static ɵpipe: i0.ɵɵPipeDeclaration<CurrencyPipe, "currency", true>;
}
`,
      'currency.d.ts',
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('pipe');
    expect(entries[0].pipeName).toBe('currency');
  });
});

describe('.d.ts NgModule scanning', () => {
  it('extracts NgModule exports from .d.ts', () => {
    const entries = scanDtsFile(
      `
import * as i0 from "@angular/core";
import * as i1 from "./button";
declare class SharedModule {
    static ɵmod: i0.ɵɵNgModuleDeclaration<SharedModule, [typeof i1.ButtonComponent], never, [typeof i1.ButtonComponent]>;
}
`,
      'shared.d.ts',
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('ngmodule');
    expect(entries[0].className).toBe('SharedModule');
    expect(entries[0].exports).toContain('ButtonComponent');
  });
});

describe('collectImportedPackages', () => {
  it('extracts bare-specifier package names, skips relative', () => {
    const packages = collectImportedPackages(
      `
      import { Component } from '@angular/core';
      import { RouterOutlet } from '@angular/router';
      import { Observable } from 'rxjs';
      import { MyService } from './my-service';
    `,
      'test.ts',
    );

    expect(packages.has('@angular/core')).toBe(true);
    expect(packages.has('@angular/router')).toBe(true);
    expect(packages.has('rxjs')).toBe(true);
    // Relative imports should be skipped
    expect(packages.has('./my-service')).toBe(false);
    expect(packages.size).toBe(3);
  });

  it('handles scoped packages correctly', () => {
    const packages = collectImportedPackages(
      `
      import { input } from '@angular/core';
      import { injectLoad } from '@analogjs/router';
      import { map } from 'rxjs/operators';
    `,
      'test.ts',
    );

    expect(packages.has('@angular/core')).toBe(true);
    expect(packages.has('@analogjs/router')).toBe(true);
    expect(packages.has('rxjs')).toBe(true);
    // Should not include the subpath
    expect(packages.has('rxjs/operators')).toBe(false);
  });
});

describe('collectRelativeReExports', () => {
  it('returns relative `export *` and `export { } from` specifiers', () => {
    const code = `
      export * from './a';
      export * as Ns from './b';
      export { Foo } from './c';
      export { Bar } from 'pkg';
      export const local = 1;
    `;
    const result = collectRelativeReExports(code, 'index.ts');
    expect(result).toEqual(['./a', './b', './c']);
  });

  it('skips bare-specifier re-exports', () => {
    const code = `export * from '@angular/core';`;
    expect(collectRelativeReExports(code, 'i.ts')).toEqual([]);
  });
});
