import { InjectionToken } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { expect, test } from 'vitest';

test.each([1, 2])('provide and inject dependency #%s', () => {
  const MY_TOKEN = new InjectionToken<string>('MY_TOKEN');

  TestBed.configureTestingModule({
    providers: [{ provide: MY_TOKEN, useValue: 'My Value' }],
  });

  expect(TestBed.inject(MY_TOKEN)).toBe('My Value');
});
