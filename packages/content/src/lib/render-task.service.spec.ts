import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { expect } from 'vitest';
import { RenderTaskService } from './render-task.service';

describe('RenderTaskService', () => {
  async function staysUnstable(): Promise<boolean> {
    let stable = false;
    TestBed.inject(ApplicationRef)
      .whenStable()
      .then(() => (stable = true));
    await new Promise((resolve) => setTimeout(resolve, 10));
    return !stable;
  }

  function setup() {
    TestBed.configureTestingModule({ providers: [RenderTaskService] });
    return TestBed.inject(RenderTaskService);
  }

  it('should keep the application unstable until the task is cleared', async () => {
    const service = setup();

    const task = service.addRenderTask();
    expect(await staysUnstable()).toBe(true);

    service.clearRenderTask(task);
    await expect(
      TestBed.inject(ApplicationRef).whenStable(),
    ).resolves.toBeUndefined();
  });
});
