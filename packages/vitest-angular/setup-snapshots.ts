import { createAngularFixtureSnapshotSerializer } from './snapshot-serializers';

const env = globalThis as any;

['expect'].forEach((methodName) => {
  const originalVitestFn = env[methodName];
  if (!originalVitestFn) {
    return;
  }
  originalVitestFn.addSnapshotSerializer(
    createAngularFixtureSnapshotSerializer(),
  );
});
