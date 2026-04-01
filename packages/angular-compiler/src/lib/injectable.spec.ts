import { describe, it, expect } from 'vitest';
import { compileCode as compile } from './test-helpers';
import { expectCompiles } from './test-helpers';

describe('@Injectable', () => {
  it('compiles with providedIn root', () => {
    const result = compile(
      `
      import { Injectable } from '@angular/core';
      @Injectable({ providedIn: 'root' })
      export class DataService {}
    `,
      'data.service.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵprov');
    expect(result).toContain('ɵfac');
    expect(result).toContain('root');
  });

  it('compiles with providedIn platform', () => {
    const result = compile(
      `
      import { Injectable } from '@angular/core';
      @Injectable({ providedIn: 'platform' })
      export class PlatformService {}
    `,
      'platform.service.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵprov');
    expect(result).toContain('platform');
  });

  it('compiles without providedIn (defaults to root)', () => {
    const result = compile(
      `
      import { Injectable } from '@angular/core';
      @Injectable()
      export class ScopedService {}
    `,
      'scoped.service.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵprov');
  });
});
