import { Injectable, PendingTasks, inject } from '@angular/core';

@Injectable()
export class RenderTaskService {
  #pendingTasks = inject(PendingTasks);

  addRenderTask(): () => void {
    return this.#pendingTasks.add();
  }

  clearRenderTask(clear: () => void): void {
    clear();
  }
}
