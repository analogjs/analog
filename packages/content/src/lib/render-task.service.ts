import {
  Injectable,
  inject,
  ɵPendingTasks as PendingTasks,
} from '@angular/core';

@Injectable()
export class RenderTaskService {
  #pendingTasks = inject(PendingTasks);

  addRenderTask() {
    return this.#pendingTasks.add();
  }

  clearRenderTask(id: number) {
    this.#pendingTasks.remove(id);
  }
}
