import { Component } from '@angular/core';
import { expect, test } from 'vitest';

// A component decorator above the throw site forces Angular's compilation to
// insert generated definitions (`ɵfac`, `ɵcmp`) into the emit, which shifts
// line numbers between the .ts source and the compiled JS. Without a correct
// sourcemap chain the stack trace below reports the post-compile line number,
// not the original .ts line.
@Component({
  standalone: true,
  selector: 'lib-padded',
  template: '',
})
export class PaddedComponent {}

// The throw below sits on a known source line. With a working sourcemap
// chain through the plugin pipeline, `Error.stack` should report a line
// close to THROW_LINE — Angular's compile-time emit inserts a few lines
// of generated code (`ɵfac`/`ɵcmp`) that the sourcemap doesn't perfectly
// attribute, so a small tolerance is allowed. The regression this guards
// against is a much larger offset (~20+ lines) caused by the OXC
// post-transform stripping the chain.
const THROW_LINE = 34;
const MAX_OFFSET = 6;

function parseSpecLine(stack: string): number | null {
  const match = /sourcemap\.spec\.ts[^:]*:(\d+)(?::\d+)?/.exec(stack);
  return match ? Number(match[1]) : null;
}

test('error stack maps back to the original TypeScript line', () => {
  let stack = '';
  try {
    throw new Error('sourcemap probe');
  } catch (e) {
    stack = (e as Error).stack ?? '';
  }
  const reportedLine = parseSpecLine(stack);
  expect(reportedLine, `no spec frame in stack:\n${stack}`).not.toBeNull();
  expect(
    Math.abs((reportedLine as number) - THROW_LINE),
    `reported line ${reportedLine}, expected within ${MAX_OFFSET} of ${THROW_LINE}\n${stack}`,
  ).toBeLessThanOrEqual(MAX_OFFSET);
});
