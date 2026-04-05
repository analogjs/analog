import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { MyPackage } from './my-package';
import { page } from 'vitest/browser';

describe('MyPackage', () => {
  it('works', async () => {
    TestBed.createComponent(MyPackage);

    await expect
      .element(page.elementLocator(document.body))
      .toHaveTextContent('My Package');
  });
});
