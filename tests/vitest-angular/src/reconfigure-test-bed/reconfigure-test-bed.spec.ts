import { TestBed } from '@angular/core/testing';
import { expect, test } from 'vitest';
import { MY_TOKEN } from './my-token';

test('reconfigures the test environment when setupTestBed runs again', () => {
  expect(TestBed.inject(MY_TOKEN)).toBe('My Value');
});
