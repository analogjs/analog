import {
  ApplicationRef,
  Component,
  DestroyRef,
  Injectable,
  ResourceRef,
  inject,
  resource,
  signal,
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { httpResource, provideHttpClient } from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { UntilSettled, trackResource } =
  await vi.importActual<typeof import('./until-settled')>('@analogjs/router');

@Injectable({ providedIn: 'root' })
class Probe {
  profile!: ResourceRef<{ name: string } | undefined>;
  created = 0;
  destroyed = 0;
}

@Component({
  standalone: true,
  selector: 'analogjs-profile',
  template: `@if (profile.hasValue()) {
    <h2>{{ profile.value().name }}</h2>
  }`,
})
class Profile {
  readonly profile = trackResource(
    httpResource<{ name: string }>(() => '/api/profile'),
  );

  constructor() {
    const probe = inject(Probe);
    probe.profile = this.profile;
    probe.created++;
    inject(DestroyRef).onDestroy(() => probe.destroyed++);
  }
}

@Component({
  standalone: true,
  selector: 'analogjs-activity',
  template: `@if (activity.hasValue()) {
    <p>{{ activity.value() }}</p>
  }`,
})
class Activity {
  readonly activity = trackResource(httpResource.text(() => '/api/activity'));
}

@Component({
  standalone: true,
  imports: [UntilSettled, Profile],
  template: `
    @if (visible()) {
      <analogjs-profile *untilSettled="loading; error: failed" />
    }
    <ng-template #loading><p class="loading">Loading profile</p></ng-template>
    <ng-template #failed let-error
      ><p class="error">Failed: {{ error.status }}</p></ng-template
    >
  `,
})
class Single {
  readonly visible = signal(true);
}

@Component({
  standalone: true,
  imports: [UntilSettled, Profile, Activity],
  template: `
    <section *untilSettled="loading; error: failed">
      <analogjs-profile />
      <analogjs-activity />
    </section>
    <ng-template #loading><p class="loading">Loading both</p></ng-template>
    <ng-template #failed><p class="error">Failed</p></ng-template>
  `,
})
class Grouped {}

@Component({
  standalone: true,
  imports: [UntilSettled, Profile, Activity],
  template: `
    <section *untilSettled="loading; error: failed">
      <analogjs-profile />
      <analogjs-activity
        *untilSettled="activityLoading; error: activityError"
      />
    </section>
    <ng-template #loading><p class="loading">Loading dashboard</p></ng-template>
    <ng-template #failed><p class="error">Dashboard failed</p></ng-template>
    <ng-template #activityLoading
      ><p class="activity-loading">Loading activity</p></ng-template
    >
    <ng-template #activityError
      ><p class="activity-error">Activity failed</p></ng-template
    >
  `,
})
class Nested {}

@Component({
  standalone: true,
  imports: [UntilSettled, Activity],
  template: `
    <section *untilSettled="loading; error: failed">
      <analogjs-activity *untilSettled="loading" />
    </section>
    <ng-template #loading><p>Loading</p></ng-template>
    <ng-template #failed
      ><p class="error">Parent handled failure</p></ng-template
    >
  `,
})
class ForwardedError {}

@Component({
  standalone: true,
  selector: 'analogjs-dependent',
  template: `@if (activity.hasValue()) {
    <p>{{ activity.value() }}</p>
  }`,
})
class Dependent {
  readonly profile = trackResource(
    httpResource<{ name: string }>(() => '/api/profile'),
  );
  readonly activity = trackResource(
    httpResource.text(() =>
      this.profile.hasValue() ? '/api/activity' : undefined,
    ),
  );
}

@Component({
  standalone: true,
  imports: [UntilSettled, Dependent],
  template: `
    <analogjs-dependent *untilSettled="loading" />
    <ng-template #loading><p class="loading">Loading</p></ng-template>
  `,
})
class Chained {}

async function waitForView(assertion: () => void) {
  await vi.waitFor(() => {
    TestBed.tick();
    assertion();
  });
}

describe('untilSettled', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
  });

  it('keeps hidden content alive, reveals resolved data, and retains the instance during reload', async () => {
    const fixture = TestBed.createComponent(Single);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    await waitForView(() =>
      expect(fixture.nativeElement.querySelector('.loading')).not.toBeNull(),
    );
    expect(fixture.nativeElement.querySelector('analogjs-profile')).toBeNull();
    http.expectOne('/api/profile').flush({ name: 'Ada' });

    await waitForView(() =>
      expect(fixture.nativeElement.textContent).toContain('Ada'),
    );
    const element = fixture.nativeElement.querySelector('analogjs-profile');
    const probe = TestBed.inject(Probe);
    probe.profile.reload();
    TestBed.tick();
    expect(fixture.nativeElement.querySelector('analogjs-profile')).toBe(
      element,
    );
    expect(fixture.nativeElement.querySelector('.loading')).toBeNull();
    http.expectOne('/api/profile').flush({ name: 'Grace' });
    await waitForView(() =>
      expect(fixture.nativeElement.textContent).toContain('Grace'),
    );
    expect(probe.created).toBe(1);
    fixture.destroy();
    expect(probe.destroyed).toBe(1);
    http.verify();
  });

  it('renders the resource error and recovers when that resource reloads', async () => {
    const fixture = TestBed.createComponent(Single);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    await waitForView(() =>
      expect(fixture.nativeElement.querySelector('.loading')).not.toBeNull(),
    );
    http.expectOne('/api/profile').flush('Unavailable', {
      status: 503,
      statusText: 'Unavailable',
    });
    await waitForView(() =>
      expect(fixture.nativeElement.textContent).toContain('Failed: 503'),
    );
    TestBed.inject(Probe).profile.reload();
    await waitForView(() =>
      expect(fixture.nativeElement.querySelector('.loading')).not.toBeNull(),
    );
    http.expectOne('/api/profile').flush({ name: 'Ada' });
    await waitForView(() =>
      expect(fixture.nativeElement.textContent).toContain('Ada'),
    );
    expect(TestBed.inject(Probe).created).toBe(1);
    http.verify();
  });

  it('waits for every resource in a shared scope', async () => {
    const fixture = TestBed.createComponent(Grouped);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    await waitForView(() =>
      expect(fixture.nativeElement.querySelector('.loading')).not.toBeNull(),
    );
    http.expectOne('/api/profile').flush({ name: 'Ada' });
    await waitForView(() =>
      expect(TestBed.inject(Probe).profile.hasValue()).toBe(true),
    );
    expect(fixture.nativeElement.querySelector('section')).toBeNull();
    http.expectOne('/api/activity').flush('Three updates');
    await waitForView(() =>
      expect(fixture.nativeElement.textContent).toContain('Three updates'),
    );
    expect(fixture.nativeElement.textContent).toContain('Ada');
    http.verify();
  });

  it('reveals the parent with a nested fallback and keeps nested errors local', async () => {
    const fixture = TestBed.createComponent(Nested);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    await waitForView(() =>
      expect(fixture.nativeElement.querySelector('.loading')).not.toBeNull(),
    );
    http.expectOne('/api/profile').flush({ name: 'Ada' });
    await waitForView(() =>
      expect(fixture.nativeElement.textContent).toContain('Ada'),
    );
    expect(
      fixture.nativeElement.querySelector('.activity-loading'),
    ).not.toBeNull();
    http.expectOne('/api/activity').flush('Unavailable', {
      status: 503,
      statusText: 'Unavailable',
    });
    await waitForView(() =>
      expect(
        fixture.nativeElement.querySelector('.activity-error'),
      ).not.toBeNull(),
    );
    expect(fixture.nativeElement.textContent).toContain('Ada');
    expect(fixture.nativeElement.querySelector('.error')).toBeNull();
    http.verify();
  });

  it('forwards an error to an enclosing scope when no local error template exists', async () => {
    const fixture = TestBed.createComponent(ForwardedError);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    await waitForView(() =>
      expect(fixture.nativeElement.textContent).toContain('Loading'),
    );
    http.expectOne('/api/activity').flush('Unavailable', {
      status: 503,
      statusText: 'Unavailable',
    });
    await waitForView(() =>
      expect(fixture.nativeElement.textContent).toContain(
        'Parent handled failure',
      ),
    );
    http.verify();
  });

  it('destroys pending content and cancels its request when removed', async () => {
    const fixture = TestBed.createComponent(Single);
    fixture.detectChanges();
    await waitForView(() =>
      expect(fixture.nativeElement.querySelector('.loading')).not.toBeNull(),
    );
    const request = TestBed.inject(HttpTestingController).expectOne(
      '/api/profile',
    );
    const views = TestBed.inject(ApplicationRef).viewCount;
    fixture.componentInstance.visible.set(false);
    TestBed.tick();
    expect(request.cancelled).toBe(true);
    expect(TestBed.inject(Probe).destroyed).toBe(1);
    expect(TestBed.inject(ApplicationRef).viewCount).toBe(views - 1);
    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('preserves the resource API outside a resource tracking scope', async () => {
    const value = TestBed.runInInjectionContext(() => {
      const original = resource({ loader: async () => 'ready' });
      expect(trackResource(original)).toBe(original);
      return original;
    });
    await waitForView(() => expect(value.value()).toBe('ready'));
  });

  it('waits for a resource that starts when another registered resource resolves', async () => {
    const fixture = TestBed.createComponent(Chained);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    await waitForView(() =>
      expect(fixture.nativeElement.querySelector('.loading')).not.toBeNull(),
    );
    http.expectNone('/api/activity');
    http.expectOne('/api/profile').flush({ name: 'Ada' });
    const request = await vi.waitFor(() => {
      TestBed.tick();
      return http.expectOne('/api/activity');
    });
    expect(fixture.nativeElement.querySelector('.loading')).not.toBeNull();
    expect(
      fixture.nativeElement.querySelector('analogjs-dependent'),
    ).toBeNull();
    request.flush('Three updates');
    await waitForView(() =>
      expect(fixture.nativeElement.textContent).toContain('Three updates'),
    );
    http.verify();
  });
});
