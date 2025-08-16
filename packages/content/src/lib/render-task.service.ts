import { Injectable, inject } from '@angular/core';
import { ɵPendingTasksInternal as ɵPendingTasks } from '@angular/core';

@Injectable()
export class RenderTaskService {
  #pendingTasks = inject(ɵPendingTasks);

  addRenderTask() {
    return this.#pendingTasks.add();
  }

  clearRenderTask(clear: number | (() => void)): void {
    if (typeof clear === 'function') {
      clear();
    } else if (typeof (this.#pendingTasks as any).remove === 'function') {
      (this.#pendingTasks as any).remove(clear);
    }
  }
}
