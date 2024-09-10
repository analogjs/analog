const env = globalThis as any;

/**
 * Allows Vitest to handle Angular test fixtures
 *
 * Vitest Snapshot guide ==> https://vitest.dev/guide/snapshot.html
 *
 * @returns customSnapshotSerializer for Angular Fixture Component
 */
const customSnapshotSerializer = () => {
  function serialize(
    val: any,
    config: any,
    indentation: any,
    depth: any,
    refs: any,
    printer: any
  ): string {
    // `printer` is a function that serializes a value using existing plugins.
    return `${printer(
      fixtureVitestSerializer(val),
      config,
      indentation,
      depth,
      refs
    )}`;
  }
  function test(val: any): boolean {
    // * If it's a ComponentFixture we apply the transformation rules
    return val && isAngularFixture(val);
  }
  return {
    serialize,
    test,
  };
};

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

  const selector = Reflect.getOwnPropertyDescriptor(
    componentType,
    '__annotations__'
  )?.value[0].selector;

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
    'text/html'
  );

  return doc.body.childNodes[0];
}

['expect'].forEach((methodName) => {
  const originalvitestFn = env[methodName];
  return originalvitestFn.addSnapshotSerializer(customSnapshotSerializer());
});
