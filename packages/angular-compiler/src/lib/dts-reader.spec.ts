import { describe, it, expect } from 'vitest';
import { scanDtsFile } from './dts-reader';

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
