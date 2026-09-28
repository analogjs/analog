import {
  normalizePath,
  type HMRPayload,
  type Update,
  type ViteDevServer,
} from 'vite';

const HOT_UPDATE_DEBOUNCE_MS = 100;

type Batch = {
  ids: Set<string>;
  promise: Promise<void>;
  resolve: () => void;
  reject: (error: unknown) => void;
};

type Notification = {
  payload: HMRPayload;
  send: (payload: HMRPayload) => void;
};

export function createHotUpdateBatcher(
  compile: (ids: string[]) => Promise<void>,
) {
  let scheduledBatch: Batch | undefined;
  let compileTimer: ReturnType<typeof setTimeout> | undefined;
  const pendingCompilations = new Set<Promise<void>>();
  const notifications = createHotUpdateNotifications(
    () => pendingCompilations.size > 0,
  );

  async function run(batch: Batch) {
    scheduledBatch = undefined;
    compileTimer = undefined;
    try {
      await compile([...batch.ids]);
      batch.resolve();
    } catch (error) {
      batch.reject(error);
    } finally {
      pendingCompilations.delete(batch.promise);
      notifications.queueFlush();
    }
  }

  return {
    schedule(file: string, ids: string[]) {
      notifications.track(file);
      if (!scheduledBatch) {
        let resolve!: () => void;
        let reject!: (error: unknown) => void;
        const promise = new Promise<void>((res, rej) => {
          resolve = res;
          reject = rej;
        });
        scheduledBatch = { ids: new Set(), promise, resolve, reject };
        pendingCompilations.add(promise);
      }
      const batch = scheduledBatch;
      for (const id of ids) batch.ids.add(id);
      clearTimeout(compileTimer);
      compileTimer = setTimeout(() => run(batch), HOT_UPDATE_DEBOUNCE_MS);
      return batch.promise;
    },
    async wait() {
      while (pendingCompilations.size) await Promise.all(pendingCompilations);
    },
    configureServer: notifications.configureServer,
    close() {
      clearTimeout(compileTimer);
      compileTimer = undefined;
      if (scheduledBatch) {
        pendingCompilations.delete(scheduledBatch.promise);
        scheduledBatch.reject(
          new Error('Angular hot update cancelled: server closed'),
        );
        scheduledBatch = undefined;
      }
      notifications.close();
    },
  };
}

function createHotUpdateNotifications(hasPendingCompilations: () => boolean) {
  const changedFiles = new Set<string>();
  const reloads = new Map<string, Notification>();
  const components = new Map<string, Notification>();
  const updates = new Map<string, Update>();
  const restoreChannels: (() => void)[] = [];
  let sendUpdates: Notification['send'] | undefined;
  let notificationTimer: ReturnType<typeof setTimeout> | undefined;
  let sending = false;
  let closed = false;

  function clear() {
    reloads.clear();
    components.clear();
    updates.clear();
    sendUpdates = undefined;
  }

  function buffer(payload: HMRPayload, send: Notification['send']) {
    switch (payload.type) {
      case 'full-reload':
        if (
          !payload.triggeredBy ||
          !changedFiles.has(normalizePath(payload.triggeredBy))
        ) {
          return false;
        }
        reloads.set(payload.path ?? '*', { payload, send });
        return true;
      case 'update':
        sendUpdates = send;
        for (const update of payload.updates) {
          const key = `${update.type}:${update.path}:${update.acceptedPath}`;
          const previous = updates.get(key);
          if (!previous || update.timestamp >= previous.timestamp) {
            updates.set(key, update);
          }
        }
        return true;
      case 'custom':
        if (payload.event !== 'angular:component-update') return false;
        components.set(payload.data.id, { payload, send });
        return true;
      default:
        return false;
    }
  }

  function flush() {
    notificationTimer = undefined;
    if (hasPendingCompilations()) return;
    changedFiles.clear();

    // A client channel can forward through server.ws; don't capture our flush again.
    sending = true;
    try {
      const reload = reloads.get('*');
      if (reload) {
        reload.send(reload.payload);
        return;
      }
      for (const { payload, send } of reloads.values()) send(payload);
      for (const { payload, send } of components.values()) send(payload);
      if (sendUpdates && updates.size) {
        sendUpdates({ type: 'update', updates: [...updates.values()] });
      }
    } finally {
      sending = false;
      clear();
    }
  }

  function queueFlush() {
    if (closed) return;
    clearTimeout(notificationTimer);
    // Vite propagates updates after the hot-update promises settle.
    notificationTimer = setTimeout(flush, 0);
  }

  return {
    track(file: string) {
      changedFiles.add(normalizePath(file));
    },
    queueFlush,
    configureServer(server: ViteDevServer) {
      closed = false;
      // Vite 6 can use a separate client channel; newer Vite shares server.ws.
      const channels = new Set([server.ws, server.environments?.client.hot]);
      for (const channel of channels) {
        if (!channel) continue;
        const original = channel.send;
        const send = original.bind(channel);
        const wrapped: typeof original = (
          payload: HMRPayload | string,
          data?: unknown,
        ) => {
          const message: HMRPayload =
            typeof payload === 'string'
              ? { type: 'custom', event: payload, data }
              : payload;
          if (!sending && changedFiles.size > 0 && buffer(message, send)) {
            queueFlush();
            return;
          }
          if (message.type === 'error') clear();
          send(message);
        };
        channel.send = wrapped;
        restoreChannels.push(() => {
          if (channel.send === wrapped) channel.send = original;
        });
      }
    },
    close() {
      closed = true;
      clearTimeout(notificationTimer);
      notificationTimer = undefined;
      changedFiles.clear();
      clear();
      for (const restore of restoreChannels.splice(0)) restore();
    },
  };
}
