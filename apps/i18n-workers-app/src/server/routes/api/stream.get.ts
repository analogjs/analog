import { defineEventHandler, sendStream } from 'h3';
export default defineEventHandler((event) =>
  sendStream(
    event,
    new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(
          encoder.encode(process.env['ANALOG_I18N_LOCALE'] + ':first\n'),
        );
        await new Promise((resolve) => setTimeout(resolve, 80));
        controller.enqueue(
          encoder.encode(process.env['ANALOG_I18N_LOCALE'] + ':last\n'),
        );
        controller.close();
      },
    }),
  ),
);
