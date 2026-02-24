import { TestBed } from '@angular/core/testing';
import { expect, test } from 'vitest';
import { MY_TOKEN } from './my-token';

test('configure providers with setupTestBed', () => {
  expect(TestBed.inject(MY_TOKEN)).toBe('My Value');
});
