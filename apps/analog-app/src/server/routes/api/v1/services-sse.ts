import { createEventStream, defineHandler } from 'nitro/h3';

import { getServices, SERVICES_SOURCE_PATH } from '../../../lib/services';
import { watchDemoSourceFile } from '../../../lib/demo-data';

export default defineHandler(async (event) => {
  const eventStream = createEventStream(event);
  let lastPayload = '';

  const pushServices = async () => {
    const payload = JSON.stringify(getServices());
    if (payload === lastPayload) {
      return;
    }

    lastPayload = payload;
    await eventStream.push(payload);
  };

  await pushServices();

  const stopWatching = watchDemoSourceFile(SERVICES_SOURCE_PATH, pushServices);

  eventStream.onClosed(async () => {
    stopWatching();
    await eventStream.close();
  });

  return eventStream.send();
});
