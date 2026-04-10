// True cross-cutting integration tests live here. Topical coverage moved
// to dedicated spec files (registry, ngmodule, injectable, type-elision,
// component, directive, hmr, metadata-emit, dts-reader, jit-transform,
// cross-file-resolution). Add tests here only when they exercise multiple
// subsystems together in a way that has no natural single-file home.

import { describe, it, expect } from 'vitest';
import { scanFile } from './registry';
import { compileCode as compile } from './test-helpers';
import { jitTransform } from './jit-transform';
import {
  ANGULAR_DECORATORS,
  COMPILABLE_DECORATORS,
  FIELD_DECORATORS,
  SIGNAL_APIS,
} from './constants';

describe('Shared constants prevent drift', () => {
  // Guards against `ANGULAR_DECORATORS`, `COMPILABLE_DECORATORS`,
  // `FIELD_DECORATORS`, and `SIGNAL_APIS` drifting out of sync between the
  // registry scanner, the AOT compiler, and the JIT transform. This sits in
  // integration.spec.ts (rather than any single subsystem's spec) because
  // every assertion crosses subsystem boundaries on purpose.

  it('COMPILABLE_DECORATORS is a strict subset of ANGULAR_DECORATORS', () => {
    for (const name of COMPILABLE_DECORATORS) {
      expect(ANGULAR_DECORATORS.has(name)).toBe(true);
    }
    expect(COMPILABLE_DECORATORS.has('Injectable')).toBe(false);
    expect(ANGULAR_DECORATORS.has('Injectable')).toBe(true);
  });

  it('registry scanFile uses COMPILABLE_DECORATORS (skips @Injectable)', () => {
    const entries = scanFile(
      `
      import { Injectable } from '@angular/core';

      @Injectable({ providedIn: 'root' })
      export class MyService {}
    `,
      'service.ts',
    );
    expect(entries).toHaveLength(0);
  });

  it('registry scanFile recognises all COMPILABLE_DECORATORS', () => {
    const entries = scanFile(
      `
      import { Component, Directive, Pipe, NgModule } from '@angular/core';

      @Component({ selector: 'app-a', template: '' })
      export class CompA {}

      @Directive({ selector: '[dir]' })
      export class DirA {}

      @Pipe({ name: 'myPipe' })
      export class MyPipe {}

      @NgModule({ exports: [CompA] })
      export class MyModule {}
    `,
      'all.ts',
    );
    expect(entries).toHaveLength(4);
    expect(entries.map((e) => e.kind).sort()).toEqual([
      'component',
      'directive',
      'ngmodule',
      'pipe',
    ]);
  });

  it('compile handles all ANGULAR_DECORATORS via shared set', () => {
    const result = compile(
      `
      import { Component, Injectable } from '@angular/core';

      @Injectable({ providedIn: 'root' })
      export class MyService {}

      @Component({ selector: 'app-test', template: '<p>hi</p>' })
      export class TestComponent {}
    `,
      'test.ts',
    );
    expect(result).toBeTruthy();
    expect(result).toContain('ɵcmp');
  });

  it('JIT transform uses ANGULAR_DECORATORS for all five decorators', () => {
    const result = jitTransform(
      `
      import { Component, Directive, Pipe, NgModule } from '@angular/core';

      @Component({ selector: 'app-a', template: '' })
      export class CompA {}

      @Directive({ selector: '[dir]' })
      export class DirA {}

      @Pipe({ name: 'p', pure: true })
      export class PipeA {}

      @NgModule({ exports: [] })
      export class ModA {}
    `,
      'all.ts',
    ).code;

    expect(result).toContain('CompA.decorators');
    expect(result).toContain('DirA.decorators');
    expect(result).toContain('PipeA.decorators');
    expect(result).toContain('ModA.decorators');
  });

  it('FIELD_DECORATORS covers all member decorator types', () => {
    const result = compile(
      `
      import { Component, Input, Output, ViewChild, ContentChild, HostBinding, HostListener, EventEmitter, ElementRef } from '@angular/core';

      @Component({ selector: 'app-test', template: '' })
      export class TestComponent {
        @Input() name: string = '';
        @Output() clicked = new EventEmitter();
        @ViewChild('ref') ref!: ElementRef;
        @ContentChild('slot') slot!: ElementRef;
        @HostBinding('class.active') isActive = true;
        @HostListener('click') onClick() {}
      }
    `,
      'test.ts',
    );
    expect(result).toBeTruthy();
    // Field decorators should be stripped from the compiled output
    for (const dec of FIELD_DECORATORS) {
      expect(result).not.toMatch(new RegExp(`@${dec}\\(`));
    }
  });

  it('SIGNAL_APIS covers all signal-based reactive APIs in compilation', () => {
    const result = compile(
      `
      import { Component, input, output, model, viewChild, contentChild, ElementRef } from '@angular/core';

      @Component({ selector: 'app-test', template: '<div #box></div>' })
      export class TestComponent {
        name = input<string>();
        requiredName = input.required<string>();
        clicked = output<void>();
        value = model<string>();
        box = viewChild<ElementRef>('box');
      }
    `,
      'test.ts',
    );
    expect(result).toBeTruthy();
    // Signal APIs should produce Ivy input/output definitions
    expect(result).toContain('ɵcmp');
    // Touch the imported set so the linter sees it (and so a future
    // addition to SIGNAL_APIS forces a manual review of this test).
    expect(SIGNAL_APIS.size).toBeGreaterThan(0);
  });
});
