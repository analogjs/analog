import {
  ApplicationRef,
  Component,
  ComponentRef,
  DestroyRef,
  Directive,
  EmbeddedViewRef,
  ErrorHandler,
  EnvironmentInjector,
  Injector,
  OnDestroy,
  OnInit,
  Resource,
  TemplateRef,
  ViewContainerRef,
  assertInInjectionContext,
  afterNextRender,
  computed,
  createComponent,
  effect,
  inject,
  input,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { ɵRESOURCE_TRACKING_STREAM } from '@analogjs/router/tokens';

type TrackedResource = Pick<Resource<unknown>, 'isLoading' | 'error'>;

class ResourceTrackingScope {
  private readonly resources = signal<TrackedResource[]>([]);

  readonly pending = computed(() =>
    this.resources().some((resource) => resource.isLoading()),
  );
  readonly error = computed(() =>
    this.resources()
      .map((resource) => (resource.isLoading() ? undefined : resource.error()))
      .find((error) => error !== undefined),
  );

  register(resource: TrackedResource): () => void {
    // Each registration has its own lifetime, even for a shared resource.
    const registration = {
      isLoading: resource.isLoading,
      error: resource.error,
    };
    this.resources.update((resources) => [...resources, registration]);
    return () => {
      this.resources.update((resources) =>
        resources.filter((entry) => entry !== registration),
      );
    };
  }
}

/** Register a resource with the nearest untilSettled view, preserving its API. */
export function trackResource<R extends TrackedResource>(resource: R): R {
  assertInInjectionContext(trackResource);
  const scope = inject(ResourceTrackingScope, { optional: true });
  if (scope) {
    inject(DestroyRef).onDestroy(scope.register(resource));
  }
  return resource;
}

export interface UntilSettledErrorContext {
  $implicit: unknown;
}

@Component({
  selector: 'analogjs-resource-tracking-view',
  standalone: true,
  template: '<ng-template #content />',
})
class ResourceTrackingView {
  readonly container = viewChild.required('content', {
    read: ViewContainerRef,
  });
}

@Directive({
  // eslint-disable-next-line @angular-eslint/directive-selector
  selector: '[untilSettled]',
  standalone: true,
})
export class UntilSettled implements OnInit, OnDestroy {
  readonly untilSettled =
    input.required<TemplateRef<UntilSettledErrorContext>>();
  readonly untilSettledError = input<TemplateRef<UntilSettledErrorContext>>();

  private readonly template = inject(TemplateRef);
  private readonly container = inject(ViewContainerRef);
  private readonly injector = inject(Injector);
  private readonly app = inject(ApplicationRef);
  private readonly environmentInjector = inject(EnvironmentInjector);
  private readonly errorHandler = inject(ErrorHandler);
  private readonly parentScope = inject(ResourceTrackingScope, {
    optional: true,
  });
  private readonly stream = inject(ɵRESOURCE_TRACKING_STREAM, {
    optional: true,
  });
  private readonly scope = new ResourceTrackingScope();
  private readonly contentInjector = Injector.create({
    parent: this.injector,
    providers: [{ provide: ResourceTrackingScope, useValue: this.scope }],
  });

  private content!: EmbeddedViewRef<unknown>;
  private hiddenHost!: ComponentRef<ResourceTrackingView>;
  private contentVisible = false;
  private revealed = false;
  private fallback?: {
    template: TemplateRef<UntilSettledErrorContext>;
    view: EmbeddedViewRef<UntilSettledErrorContext>;
  };
  private unregisterParent?: () => void;
  private reportedError: unknown;
  private streamingView?: { update(): void; destroy(): void };

  ngOnInit(): void {
    afterNextRender(
      () => {
        const finish = (
          window as Window & { __analogHydrationReady?: () => void }
        ).__analogHydrationReady;
        if (finish) void this.app.whenStable().then(finish);
      },
      { injector: this.injector },
    );
    this.streamingView = this.stream?.register({
      anchor: this.container.element.nativeElement,
      nodes: () =>
        this.contentVisible
          ? this.content.rootNodes
          : (this.fallback?.view.rootNodes ?? []),
    });
    this.unregisterParent = this.parentScope?.register({
      isLoading: signal(false),
      error: computed(() =>
        this.untilSettledError() ? undefined : this.scope.error(),
      ),
    });
    // A detached host keeps pending views in Angular's change-detection tree.
    this.hiddenHost = createComponent(ResourceTrackingView, {
      environmentInjector: this.environmentInjector,
      elementInjector: this.contentInjector,
    });
    this.app.attachView(this.hiddenHost.hostView);
    this.hiddenHost.changeDetectorRef.detectChanges();
    this.content = this.container.createEmbeddedView(
      this.template,
      {},
      {
        injector: this.contentInjector,
      },
    );
    this.hiddenHost.instance.container().insert(this.content);

    effect(
      () => {
        this.scope.pending();
        this.scope.error();
        this.untilSettled();
        this.untilSettledError();
        untracked(() => {
          this.content.detectChanges();
          this.updateView();
          this.streamingView?.update();
        });
      },
      { injector: this.injector },
    );
  }

  ngOnDestroy(): void {
    this.streamingView?.destroy();
    this.unregisterParent?.();
    if (this.content && !this.content.destroyed) {
      this.content.destroy();
    }
    if (this.hiddenHost) {
      this.app.detachView(this.hiddenHost.hostView);
      this.hiddenHost.destroy();
    }
    this.contentInjector.destroy();
  }

  private updateView(): void {
    const error = this.scope.error();
    const errorTemplate = this.untilSettledError();
    if (error !== undefined && errorTemplate) {
      this.showFallback(errorTemplate, error);
      return;
    }
    if (
      error !== undefined &&
      !this.parentScope &&
      error !== this.reportedError
    ) {
      this.reportedError = error;
      this.errorHandler.handleError(error);
    } else if (error === undefined) {
      this.reportedError = undefined;
    }
    if (this.scope.pending() && !this.revealed) {
      this.showFallback(this.untilSettled());
      return;
    }
    if (!this.contentVisible) {
      this.container.clear();
      this.fallback = undefined;
      this.container.insert(this.content);
      this.contentVisible = true;
    }
    if (error === undefined) this.revealed = true;
  }

  private showFallback(
    template: TemplateRef<UntilSettledErrorContext>,
    error?: unknown,
  ): void {
    if (this.contentVisible) {
      this.hiddenHost.instance.container().insert(this.content);
      this.contentVisible = false;
    }
    if (this.fallback?.template === template) {
      this.fallback.view.context.$implicit = error;
      this.fallback.view.markForCheck();
      return;
    }
    this.container.clear();
    this.fallback = {
      template,
      view: this.container.createEmbeddedView(
        template,
        { $implicit: error },
        { injector: this.injector },
      ),
    };
  }
}
