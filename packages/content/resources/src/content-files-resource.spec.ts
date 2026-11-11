import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';

import { contentFilesResource } from './content-files-resource';
import { CONTENT_FILES_LIST_TOKEN } from '../../src/lib/content-files-list-token';
import {
  CONTENT_LIST_LOADER,
  withContentListLoader,
} from '../../src/lib/content-list-loader';
import { RenderTaskService } from '../../src/lib/render-task.service';

describe('contentFilesResource', () => {
  it('runs the list loader again on reload', async () => {
    const files = [
      { filename: '/src/content/a.md', slug: 'a', attributes: {} },
      { filename: '/src/content/b.md', slug: 'b', attributes: {} },
    ];
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(files);
    TestBed.configureTestingModule({
      providers: [{ provide: CONTENT_LIST_LOADER, useValue: loader }],
    });

    const result = TestBed.runInInjectionContext(() =>
      contentFilesResource((file) => file.slug === 'b'),
    );
    await settle();

    expect(result.error()?.message).toBe('offline');

    result.reload();
    await settle();

    expect(loader).toHaveBeenCalledTimes(2);
    expect(result.value()).toEqual([files[1]]);
  });

  it('loads through withContentListLoader outside an injection context', async () => {
    const files = [
      { filename: '/src/content/a.md', slug: 'a', attributes: {} },
    ];
    TestBed.configureTestingModule({
      providers: [
        withContentListLoader(),
        RenderTaskService,
        { provide: CONTENT_FILES_LIST_TOKEN, useValue: files },
      ],
    });

    const result = TestBed.runInInjectionContext(() => contentFilesResource());
    await settle();

    expect(result.value()).toEqual(files);
  });
});

async function settle() {
  TestBed.tick();
  await TestBed.inject(ApplicationRef).whenStable();
}
