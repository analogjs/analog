import { describe, it, expect } from 'vitest';
import { compileCode as compile, expectCompiles } from './test-helpers';
import { angularVersionAtLeast } from './angular-version';

// `@Service` and the `compileService` compiler API landed in Angular 22.
// On older peers the API is absent, so the whole suite is skipped.
describe.skipIf(!angularVersionAtLeast(22))('@Service', () => {
  it('compiles a bare service to ɵprov via ɵɵdefineService', () => {
    const result = compile(
      `
      import { Service } from '@angular/core';
      @Service()
      export class MyService {}
    `,
      'my.service.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵfac');
    expect(result).toContain('ɵprov');
    expect(result).toContain('ɵɵdefineService');
  });

  it('emits autoProvided: false when opted out', () => {
    const result = compile(
      `
      import { Service } from '@angular/core';
      @Service({ autoProvided: false })
      export class NotProvidedService {}
    `,
      'not-provided.service.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵɵdefineService');
    expect(result).toContain('autoProvided');
  });

  it('forwards an explicit factory into ɵprov', () => {
    const result = compile(
      `
      import { Service } from '@angular/core';
      export class Alternate {}
      @Service({ factory: () => new Alternate() })
      export class MyService {}
    `,
      'with-factory.service.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵɵdefineService');
    expect(result).toContain('Alternate');
  });

  it('resolves constructor dependencies in the factory', () => {
    const result = compile(
      `
      import { Service } from '@angular/core';
      export class Dep {}
      @Service()
      export class MyService {
        constructor(dep: Dep) {}
      }
    `,
      'with-dep.service.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵfac');
    expect(result).toContain('Dep');
    expect(result).not.toContain('ɵɵinvalidFactory');
  });
});
