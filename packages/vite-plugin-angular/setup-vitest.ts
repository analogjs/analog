import 'zone.js';
import 'zone.js/dist/sync-test.js';
import 'zone.js/dist/proxy.js';
import 'zone.js/bundles/zone-testing.umd.js';

/**
 * Patch Vitest's describe/test/beforeEach/afterEach functions so test code
 * always runs in a testZone (ProxyZone).
 */
/* global Zone */
const Zone = (globalThis as any)['Zone'];

if (Zone === undefined) {
  throw new Error('Missing: Zone (zone.js)');
}

if ((globalThis as any)['__vitest_zone_patch__'] === true) {
  throw new Error("'vitest' has already been patched with 'Zone'.");
}

(globalThis as any)['__vitest_zone_patch__'] = true;
const SyncTestZoneSpec = Zone['SyncTestZoneSpec'];
const ProxyZoneSpec = Zone['ProxyZoneSpec'];

if (SyncTestZoneSpec === undefined) {
  throw new Error('Missing: SyncTestZoneSpec (zone.js/dist/sync-test)');
}
if (ProxyZoneSpec === undefined) {
  throw new Error('Missing: ProxyZoneSpec (zone.js/dist/proxy.js)');
}

const env = globalThis as any;
const ambientZone = Zone.current;

// Create a synchronous-only zone in which to run `describe` blocks in order to
// raise an error if any asynchronous operations are attempted
// inside of a `describe` but outside of a `beforeEach` or `it`.
const syncZone = ambientZone.fork(new SyncTestZoneSpec('vitest.describe'));
function wrapDescribeInZone(describeBody: any) {
  return function (...args: any) {
    return syncZone.run(describeBody, null, args);
  };
}

// Create a proxy zone in which to run `test` blocks so that the tests function
// can retroactively install different zones.
const testProxyZone = ambientZone.fork(new ProxyZoneSpec());
function wrapTestInZone(testBody: string | any[] | undefined) {
  if (testBody === undefined) {
    return;
  }

  const wrappedFunc = function () {
    return testProxyZone.run(testBody, null, arguments);
  };
  try {
    Object.defineProperty(wrappedFunc, 'length', {
      configurable: true,
      writable: true,
      enumerable: false,
    });
    wrappedFunc.length = testBody.length;
  } catch (e) {
    return testBody.length === 0
      ? () => testProxyZone.run(testBody, null)
      : (done: any) => testProxyZone.run(testBody, null, [done]);
  }

  return wrappedFunc;
}

/**
 * bind describe method to wrap describe.each function
 */
const bindDescribe = (originalVitestFn: {
  apply: (
    arg0: any,
    arg1: any[]
  ) => {
    (): any;
    new (): any;
    apply: { (arg0: any, arg1: any[]): any; new (): any };
  };
}) =>
  function (...eachArgs: any) {
    return function (...args: any[]) {
      args[1] = wrapDescribeInZone(args[1]);

      // @ts-ignore
      return originalVitestFn.apply(this, eachArgs).apply(this, args);
    };
  };

/**
 * bind test method to wrap test.each function
 */
const bindTest = (originalVitestFn: {
  apply: (
    arg0: any,
    arg1: any[]
  ) => {
    (): any;
    new (): any;
    apply: { (arg0: any, arg1: any[]): any; new (): any };
  };
}) =>
  function (...eachArgs: any) {
    return function (...args: any[]) {
      args[1] = wrapTestInZone(args[1]);

      // @ts-ignore
      return originalVitestFn.apply(this, eachArgs).apply(this, args);
    };
  };

['describe'].forEach((methodName) => {
  const originalvitestFn = env[methodName];
  env[methodName] = function (...args: any[]) {
    args[1] = wrapDescribeInZone(args[1]);

    return originalvitestFn.apply(this, args);
  };
  env[methodName].each = bindDescribe(originalvitestFn.each);
  if (methodName === 'describe') {
    env[methodName].only = env['fdescribe'];
    env[methodName].skip = env['xdescribe'];
  }
});

['test', 'it'].forEach((methodName) => {
  const originalvitestFn = env[methodName];
  env[methodName] = function (...args: any[]) {
    args[1] = wrapTestInZone(args[1]);

    return originalvitestFn.apply(this, args);
  };
  env[methodName].each = bindTest(originalvitestFn.each);

  if (methodName === 'test' || methodName === 'it') {
    env[methodName].todo = function (...args: any) {
      return originalvitestFn.todo.apply(this, args);
    };
  }
});

['beforeEach', 'afterEach', 'beforeAll', 'afterAll'].forEach((methodName) => {
  const originalvitestFn = env[methodName];
  env[methodName] = function (...args: any[]) {
    args[0] = wrapTestInZone(args[0]);

    return originalvitestFn.apply(this, args);
  };
});
