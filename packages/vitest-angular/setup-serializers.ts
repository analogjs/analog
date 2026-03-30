import {
  createHtmlCommentSnapshotSerializer,
  createNoNgAttributesSnapshotSerializer,
} from './snapshot-serializers.js';

const env = globalThis as any;

['expect'].forEach((methodName) => {
  const originalVitestFn = env[methodName];
  if (!originalVitestFn) {
    return;
  }
  originalVitestFn.addSnapshotSerializer(createHtmlCommentSnapshotSerializer());
  originalVitestFn.addSnapshotSerializer(
    createNoNgAttributesSnapshotSerializer(),
  );
});
