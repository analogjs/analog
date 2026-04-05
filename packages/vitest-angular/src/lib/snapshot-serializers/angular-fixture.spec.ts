import { describe, expect, it } from 'vitest';
import { createAngularFixtureSnapshotSerializer } from './angular-fixture';
import { Component, ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { input } from '@angular/core';
import { output } from '@angular/core';

expect.addSnapshotSerializer(createAngularFixtureSnapshotSerializer());

describe('ng-snapshot serializer', () => {
  type MockComponentRef = {
    componentType: {
      __annotations__: Array<{ selector: string }>;
    };
    location: ElementRef<HTMLElement>;
  };

  type MockComponentFixture = {
    componentRef: MockComponentRef;
    componentInstance: Record<string, unknown>;
    nativeElement: HTMLElement;
  };

  const createComponentRef = (
    selector: string,
    innerHTML: string,
  ): MockComponentRef => {
    const nativeElement = Object.assign(document.createElement(selector), {
      innerHTML,
    });

    class MockComponentType {
      static __annotations__ = [{ selector }];
    }

    return {
      componentType: MockComponentType,
      location: new ElementRef(nativeElement),
    };
  };

  const createComponentFixture = (
    selector: string,
    innerHTML: string,
    componentInstance: Record<string, unknown> = {},
  ): MockComponentFixture => {
    const componentRef = createComponentRef(selector, innerHTML);

    return {
      componentRef,
      componentInstance,
      nativeElement: componentRef.location.nativeElement,
    };
  };

  it('serializes Angular fixtures into the component selector', () => {
    const fixture = createComponentFixture(
      'app-test',
      '<div class="card-shadow"><!--container--><span>Title</span></div>',
    );

    expect(fixture).toMatchInlineSnapshot(`
      <app-test>
        <div
          class="card-shadow"
        >
          <!--container-->
          <span>
            Title
          </span>
        </div>
      </app-test>
    `);
  });

  it('serializes componentRef fixtures into the component selector', () => {
    expect(createComponentRef('app-card', '<span>Card title</span>'))
      .toMatchInlineSnapshot(`
      <app-card>
        <span>
          Card title
        </span>
      </app-card>
    `);
  });

  it('serializes an Angular component', () => {
    @Component({
      selector: 'app-chip',
      template: '<h1 (click)="onClick()">Hello {{ name }}</h1>',
    })
    class GreetingComponent {
      name = input('Alice');
      greet = output<string>();
      onClick() {
        this.greet.emit(`Hello ${this.name}`);
      }
    }
    const fixture = TestBed.createComponent(GreetingComponent);
    fixture.detectChanges();

    expect(fixture).toMatchInlineSnapshot(`
      <app-chip>
        <h1>
          Hello [Input Signal: Alice]
        </h1>
      </app-chip>
    `);
  });

  it('normalizes trailing spaces and repeated blank lines', () => {
    const fixture = createComponentFixture('app-test', '<span>Title</span>');
    const serializer = createAngularFixtureSnapshotSerializer();

    const result = serializer.serialize?.(
      fixture,
      {} as any,
      '',
      0,
      [],
      () => `<app-test>  \n\n\n  <span>Title</span>   \n</app-test>\t`,
    );

    expect(result).toBe(`<app-test>\n\n  <span>Title</span>\n</app-test>`);
  });
});
