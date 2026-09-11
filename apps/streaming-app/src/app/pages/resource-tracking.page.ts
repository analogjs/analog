import { Component, inject, input, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { httpResource } from '@angular/common/http';
import { UntilSettled, trackResource } from '@analogjs/router';

@Component({
  selector: 'app-resource-tracking-profile',
  standalone: true,
  template: `
    @if (profile.hasValue()) {
      <h2>{{ profile.value().label }}</h2>
      <button class="profile-counter" (click)="increment()">
        Count: {{ count() }}
      </button>
    }
  `,
})
export class ResourceTrackingProfile {
  readonly profile = trackResource(
    httpResource<{ label: string }>(
      () => '/api/resource-tracking?section=profile',
    ),
  );
  readonly count = signal(0);

  increment() {
    this.count.update((value) => value + 1);
  }
}

@Component({
  selector: 'app-resource-tracking-activity',
  standalone: true,
  template: `
    @if (activity.hasValue()) {
      <p class="activity-result">{{ activity.value().label }}</p>
    }
  `,
})
export class ResourceTrackingActivity {
  readonly fail = input(false);
  readonly activity = trackResource(
    httpResource<{ label: string }>(
      () => `/api/resource-tracking?section=activity&fail=${this.fail()}`,
    ),
  );
}

@Component({
  standalone: true,
  imports: [UntilSettled, ResourceTrackingProfile, ResourceTrackingActivity],
  template: `
    <h1>Explicit resource registration</h1>
    <p>
      The profile reveals first. Activity has its own loading and error views.
    </p>
    <button class="run-success" (click)="restart(false)">
      Run successfully
    </button>
    <button class="run-error" (click)="restart(true)">
      Run with an activity error
    </button>

    @for (generation of [generation()]; track generation) {
      <section *untilSettled="dashboardLoading; error: dashboardError">
        <app-resource-tracking-profile />
        <app-resource-tracking-activity
          *untilSettled="activityLoading; error: activityError"
          [fail]="fail()"
        />
      </section>
    }

    <ng-template #dashboardLoading>
      <p class="dashboard-loading" role="status">Loading dashboard…</p>
    </ng-template>
    <ng-template #activityLoading>
      <p class="activity-loading" role="status">Loading activity…</p>
    </ng-template>
    <ng-template #dashboardError>
      <p class="dashboard-error" role="alert">Dashboard unavailable.</p>
    </ng-template>
    <ng-template #activityError>
      <p class="activity-error" role="alert">
        Activity unavailable. The profile is still usable.
      </p>
    </ng-template>
  `,
})
export default class ResourceTrackingPage {
  readonly fail = signal(
    inject(ActivatedRoute).snapshot.queryParamMap.has('fail'),
  );
  readonly generation = signal(0);

  restart(fail: boolean) {
    this.fail.set(fail);
    this.generation.update((value) => value + 1);
  }
}
