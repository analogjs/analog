import {
  createAngularFixtureSnapshotSerializer,
  createHtmlCommentSnapshotSerializer,
  createNoNgAttributesSnapshotSerializer,
} from './snapshot-serializers';

const env = globalThis as any;

['expect'].forEach((methodName) => {
  const originalvitestFn = env[methodName];
  if (!originalvitestFn) {
    return;
  }
  originalvitestFn.addSnapshotSerializer(createHtmlCommentSnapshotSerializer());
  originalvitestFn.addSnapshotSerializer(
    createNoNgAttributesSnapshotSerializer(),
  );
  originalvitestFn.addSnapshotSerializer(
    createAngularFixtureSnapshotSerializer(),
  );
});
