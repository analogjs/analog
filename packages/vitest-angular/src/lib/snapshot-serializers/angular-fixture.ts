import type { ComponentFixture } from '@angular/core/testing';
import type { SnapshotSerializer } from 'vitest';

/**
 * Check if is an Angular fixture
 *
 * @param val Angular fixture
 * @returns boolean who check if is an angular fixture
 */
function isAngularFixture(val: any): boolean {
  if (typeof val !== 'object') {
    return false;
  }

  if (val['componentRef'] || val['componentInstance']) {
    return true;
  }

  if (val['componentType']) {
    return true;
  }

  // * Angular fixture keys in Fixture component Object
  const fixtureKeys = [
    'componentRef',
    'ngZone',
    'effectRunner',
    '_autoDetect',
    '_isStable',
    '_isDestroyed',
    '_resolve',
    '_promise',
    '_onUnstableSubscription',
    '_onStableSubscription',
    '_onMicrotaskEmptySubscription',
    '_onErrorSubscription',
    'changeDetectorRef',
    'elementRef',
    'debugElement',
    'componentInstance',
    'nativeElement',
  ];

  // * Angular fixture keys in Fixture componentRef Object
  const fixtureComponentRefKeys = [
    'location',
    '_rootLView',
    '_tNode',
    'previousInputValues',
    'instance',
    'changeDetectorRef',
    'hostView',
    'componentType',
  ];

  return (
    JSON.stringify(Object.keys(val)) === JSON.stringify(fixtureKeys) ||
    JSON.stringify(Object.keys(val)) === JSON.stringify(fixtureComponentRefKeys)
  );
}

/**
 * Serialize Angular fixture for Vitest
 *
 * @param fixture Angular Fixture Component
 * @returns HTML Child Node
 */
function fixtureVitestSerializer(fixture: any) {
  // * Get Component meta data
  const componentType = (
    fixture && fixture.componentType
      ? fixture.componentType
      : fixture.componentRef.componentType
  ) as any;

  let inputsData: string = '';

  const selector =
    Reflect.getOwnPropertyDescriptor(componentType, '__annotations__')?.value[0]
      ?.selector ?? componentType.ɵcmp?.selectors[0]?.[0];

  if (componentType && componentType.propDecorators) {
    inputsData = Object.entries(componentType.propDecorators)
      .map(([key, value]) => `${key}="${value}"`)
      .join('');
  }

  // * Get DOM Elements
  const divElement =
    fixture && fixture.nativeElement
      ? fixture.nativeElement
      : fixture.location.nativeElement;

  // * Convert string data to HTML data
  const doc = new DOMParser().parseFromString(
    `<${selector} ${inputsData}>${divElement.innerHTML}</${selector}>`,
    'text/html',
  );

  return doc.body.childNodes[0];
}

export function createAngularFixtureSnapshotSerializer(): SnapshotSerializer {
  return {
    serialize(val, config, indentation, depth, refs, printer) {
      return printer(
        fixtureVitestSerializer(val),
        config,
        indentation,
        depth,
        refs,
      );
    },
    test(val) {
      return val && isAngularFixture(val);
    },
  };
}
