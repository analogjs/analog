import { describe, it, expect } from 'vitest';
import { compileCode as compile } from './test-helpers';
import { expectCompiles } from './test-helpers';

describe('@Pipe', () => {
  it('compiles pure pipe', () => {
    const result = compile(
      `
      import { Pipe } from '@angular/core';
      @Pipe({ name: 'truncate' })
      export class TruncatePipe {
        transform(value: string, limit: number): string {
          return value.length > limit ? value.substring(0, limit) + '...' : value;
        }
      }
    `,
      'truncate.pipe.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵpipe');
    expect(result).toContain('ɵfac');
    expect(result).toContain('truncate');
    expect(result).toContain('pure: true');
  });

  it('compiles impure pipe', () => {
    const result = compile(
      `
      import { Pipe } from '@angular/core';
      @Pipe({ name: 'timeAgo', pure: false })
      export class TimeAgoPipe {
        transform(value: Date): string { return ''; }
      }
    `,
      'time-ago.pipe.ts',
    );

    expectCompiles(result);
    expect(result).toContain('ɵpipe');
    expect(result).toContain('timeAgo');
    expect(result).toContain('pure: false');
  });
});
