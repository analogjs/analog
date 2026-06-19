import {
  Component,
  Type,
  ViewContainerRef,
  ViewChild,
  AfterViewInit,
  inject,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';

@Component({
  selector: 'analog-route-loading',
  template: `<div #container></div>`,
  standalone: true,
})
export class RouteLoadingComponent implements AfterViewInit {
  @ViewChild('container', { read: ViewContainerRef })
  container!: ViewContainerRef;

  private route = inject(ActivatedRoute);

  async ngAfterViewInit() {
    const data = this.route.snapshot.data;
    const loadingComponent = data['_analogLoading'] as Type<any>;
    const loadComponent = data['_analogLoad'] as () => Promise<any>;

    if (!loadingComponent || !loadComponent) {
      return;
    }

    const loadingRef = this.container.createComponent(loadingComponent);

    try {
      const module = await loadComponent();
      const pageComponent = module.default || module;

      loadingRef.destroy();
      this.container.createComponent(pageComponent);
    } catch (error) {
      loadingRef.destroy();
      throw error;
    }
  }
}
