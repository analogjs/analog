import {
  Injectable,
  inject,
  ɵPendingTasks as PendingTasks,
} from '@angular/core';
import { filter, first, timeout } from 'rxjs';

@Injectable()
export class RenderTaskService {
  pendingTasks = inject(PendingTasks);
  private readonly renderTask = this.pendingTasks.add();

  constructor() {
    this.pendingTasks.hasPendingTasks
      .pipe(
        filter((isStable) => !isStable),
        timeout(100),
        first()
      )
      .subscribe({
        next: () => {},
        error: () => {
          this.clearRenderTask();
        },
      });
  }

  clearRenderTask() {
    this.pendingTasks.remove(this.renderTask);
  }
}
