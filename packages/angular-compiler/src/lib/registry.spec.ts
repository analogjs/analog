import { describe, it, expect } from 'vitest';
import { scanFile } from './registry';

describe('Registry scanFile', () => {
  it('extracts component metadata', () => {
    const entries = scanFile(
      `
      import { Component } from '@angular/core';
      @Component({ selector: 'app-test', template: '' })
      export class TestComponent {}
    `,
      'test.ts',
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].selector).toBe('app-test');
    expect(entries[0].kind).toBe('component');
    expect(entries[0].className).toBe('TestComponent');
  });

  it('extracts directive metadata', () => {
    const entries = scanFile(
      `
      import { Directive } from '@angular/core';
      @Directive({ selector: '[appTest]' })
      export class TestDirective {}
    `,
      'test.ts',
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].selector).toBe('[appTest]');
    expect(entries[0].kind).toBe('directive');
  });

  it('extracts pipe metadata', () => {
    const entries = scanFile(
      `
      import { Pipe } from '@angular/core';
      @Pipe({ name: 'myPipe' })
      export class MyPipe {}
    `,
      'test.ts',
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('pipe');
    expect(entries[0].pipeName).toBe('myPipe');
    expect(entries[0].selector).toBe('myPipe');
  });

  it('extracts NgModule with exports', () => {
    const entries = scanFile(
      `
      import { NgModule } from '@angular/core';
      @NgModule({
        declarations: [FooComponent],
        exports: [FooComponent, BarDirective]
      })
      export class SharedModule {}
    `,
      'shared.module.ts',
    );

    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('ngmodule');
    expect(entries[0].className).toBe('SharedModule');
    expect(entries[0].exports).toEqual(['FooComponent', 'BarDirective']);
  });

  it('skips files without decorators', () => {
    const entries = scanFile(
      `
      export class PlainClass {}
      export function helper() {}
    `,
      'plain.ts',
    );

    expect(entries).toHaveLength(0);
  });

  it('extracts multiple declarations from one file', () => {
    const entries = scanFile(
      `
      import { Component, Directive, Pipe } from '@angular/core';
      @Component({ selector: 'app-a', template: '' })
      export class AComponent {}
      @Directive({ selector: '[appB]' })
      export class BDirective {}
      @Pipe({ name: 'cPipe' })
      export class CPipe {}
    `,
      'multi.ts',
    );

    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.kind)).toEqual([
      'component',
      'directive',
      'pipe',
    ]);
  });
});
