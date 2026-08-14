import { createEventStream, defineHandler } from 'nitro/h3';

import { getProducts, PRODUCTS_SOURCE_PATH } from '../../../lib/products';
import { watchDemoSourceFile } from '../../../lib/demo-data';

export default defineHandler(async (event) => {
  const eventStream = createEventStream(event);
  let lastPayload = '';

  const pushProducts = async () => {
    const payload = JSON.stringify(getProducts());
    if (payload === lastPayload) {
      return;
    }

    lastPayload = payload;
    // Send the full product snapshot so clients can replace local state
    // without coordinating incremental patches.
    await eventStream.push(payload);
  };

  await pushProducts();

  const stopWatching = watchDemoSourceFile(PRODUCTS_SOURCE_PATH, pushProducts);

  eventStream.onClosed(async () => {
    stopWatching();
    await eventStream.close();
  });

  return eventStream.send();
});
