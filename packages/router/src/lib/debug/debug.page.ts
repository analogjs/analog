import { Component } from '@angular/core';

import { injectDebugRoutes, DebugRoute } from './routes';

type CollectedRoute = {
  path: string;
  filename: string;
  file: string;
  isLayout: boolean;
};

@Component({
  selector: 'analogjs-debug-routes-page',
  standalone: true,
  template: `
    <h2>Routes</h2>

    <div class="table-container">
      <div class="table-header">
        <div class="header-cell">Route Path</div>
        <div class="header-cell">File</div>
        <div class="header-cell">Type</div>
      </div>
      <div class="table-body">
        @for ( collectedRoute of collectedRoutes; track collectedRoute.filename
        ) {
        <div class="table-row">
          <div class="table-cell">{{ collectedRoute.path }}</div>
          <div class="table-cell" [title]="collectedRoute.filename">
            {{ collectedRoute.file }}
          </div>
          <div class="table-cell">
            {{ collectedRoute.isLayout ? 'Layout' : 'Page' }}
          </div>
        </div>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      width: 100%;
    }

    .table-container {
      width: 100%;
      max-width: 900px;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }

    .table-header {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      background: gray;
      border-bottom: 2px solid #e5e7eb;
    }

    .header-cell {
      padding: 16px 24px;
      font-weight: 600;
      text-transform: uppercase;
      font-size: 14px;
      letter-spacing: 0.05em;
      color: white;
    }

    .table-body {
      display: flex;
      flex-direction: column;
    }

    .table-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      border-bottom: 1px solid #e5e7eb;
      transition: background-color 0.2s ease;
    }

    .table-row:last-child {
      border-bottom: none;
    }

    .table-row:hover {
      background-color: #f9fafb;
    }

    .table-cell {
      padding: 16px 24px;
      font-size: 16px;
      color: #4b5563;
    }

    @media (max-width: 640px) {
      .table-container {
        border-radius: 0;
        margin: 0;
      }

      .header-cell,
      .table-cell {
        padding: 12px 16px;
      }
    }
  `,
})
export default class DebugRoutesComponent {
  collectedRoutes: CollectedRoute[] = [];
  debugRoutes = injectDebugRoutes();

  ngOnInit() {
    this.traverseRoutes(this.debugRoutes);
  }

  traverseRoutes(routes: DebugRoute[], parent?: string) {
    routes.forEach((route) => {
      this.collectedRoutes.push({
        path: route.isLayout
          ? `${parent ? `/${parent}` : ''}${route.path ? `/${route.path}` : ''}`
          : `${parent ? `/${parent}` : ''}${
              route.path ? `/${route.path}` : '/'
            }`,
        filename: route.filename,
        file: route.filename?.replace(/(^.*)pages\//, '') || '',
        isLayout: route.isLayout,
      });

      if (route.children) {
        this.traverseRoutes(route.children, route.path || '');
      }
    });
  }
}
