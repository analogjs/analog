import { TestBed } from '@angular/core/testing';
import { Greetings } from '../greetings';
import { expect, test } from 'vitest';

test('overrides should work even when AOT is enabled', () => {
  /* AOT is enabled through `angular({jit: false})` in `../../../vite.config.ts`. */

  TestBed.overrideComponent(Greetings, {
    set: {
      template: 'My Overriden Package',
    },
  });

  const fixture = TestBed.createComponent(Greetings);
  expect(fixture.nativeElement.textContent).toBe('My Overriden Package');
});
