import { Component, OnInit, inject } from '@angular/core';
import { Route } from '@angular/router';

import { createRoutes as createBaseRoutes } from '../route-builder';
import {
  ANALOG_EXTRA_ROUTE_FILE_SOURCES,
  type ExtraRouteFileSource,
} from '../route-files';
import { injectDebugRoutes, DebugRoute } from './routes';

type CollectedRoute = {
  path: string;
  filename: string;
  file: string;
  isLayout: boolean;
  source: 'page' | 'content';
};

@Component({
  selector: 'analogjs-debug-routes-page',
  standalone: true,
  template: `
    <h2>Routes</h2>

    <div class="table-container">
      <div class="table-header">
        <div class="header-cell path-col">Route Path</div>
        <div class="header-cell file-col">File</div>
        <div class="header-cell type-col">Type</div>
        <div class="header-cell source-col">Source</div>
      </div>
      <div class="table-body">
        @for (
          collectedRoute of collectedRoutes;
          track collectedRoute.filename
        ) {
          <div class="table-row">
            <div class="table-cell path-col">{{ collectedRoute.path }}</div>
            <div class="table-cell file-col" [title]="collectedRoute.filename">
              {{ collectedRoute.file }}
            </div>
            <div class="table-cell type-col">
              {{ collectedRoute.isLayout ? 'Layout' : 'Page' }}
            </div>
            <div class="table-cell source-col">
              <span class="source-badge" [class]="collectedRoute.source">
                {{ collectedRoute.source }}
              </span>
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
      max-width: 1000px;
      margin: 0 auto;
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }

    .table-header {
      display: grid;
      grid-template-columns: 2fr 2fr 1fr 1fr;
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
      grid-template-columns: 2fr 2fr 1fr 1fr;
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

    .source-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .source-badge.page {
      background: #dbeafe;
      color: #1e40af;
    }

    .source-badge.content {
      background: #dcfce7;
      color: #166534;
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
export default class DebugRoutesComponent implements OnInit {
  collectedRoutes: CollectedRoute[] = [];

  private debugRoutes: (Route & DebugRoute)[] = injectDebugRoutes();
  private extraSources: ExtraRouteFileSource[] =
    inject(ANALOG_EXTRA_ROUTE_FILE_SOURCES, { optional: true }) ?? [];

  ngOnInit(): void {
    this.traverseRoutes(this.debugRoutes, undefined, 'page');

    for (const source of this.extraSources) {
      const contentDebugRoutes = createBaseRoutes(
        source.files,
        source.resolveModule,
        true,
      ) as (Route & DebugRoute)[];
      this.traverseRoutes(contentDebugRoutes, undefined, 'content');
    }

    this.collectedRoutes.sort((a, b) => a.path.localeCompare(b.path));
  }

  traverseRoutes(
    routes: DebugRoute[],
    parent?: string,
    source: 'page' | 'content' = 'page',
  ): void {
    routes.forEach((route) => {
      this.collectedRoutes.push({
        path: route.isLayout
          ? `${parent ? `/${parent}` : ''}${route.path ? `/${route.path}` : ''}`
          : `${parent ? `/${parent}` : ''}${
              route.path ? `/${route.path}` : '/'
            }`,
        filename: route.filename,
        file: route.filename?.replace(/(^.*)(pages|content)\//, '') || '',
        isLayout: route.isLayout,
        source,
      });

      if (route.children) {
        const parentSegments = [parent, route.path];
        const fullParentPath = parentSegments.filter((s) => !!s).join('/');
        this.traverseRoutes(route.children, fullParentPath, source);
      }
    });
  }
}
