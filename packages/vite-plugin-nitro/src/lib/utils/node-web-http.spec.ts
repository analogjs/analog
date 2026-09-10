import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toWebRequest, writeWebResponseToNode } from './node-web-bridge';

let server: Server;
afterEach(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
async function serve(handler: (req: Request) => Response | Promise<Response>) {
  server = createServer(async (req, res) => {
    try {
      await writeWebResponseToNode(res, await handler(toWebRequest(req, res)));
    } catch {
      res.destroy();
    }
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${(server.address() as { port: number }).port}`;
}

describe('native Node response bridge', () => {
  it('preserves bodies, status, and multiple cookies', async () => {
    const url = await serve(
      async (req) =>
        new Response(await req.text(), {
          status: 201,
          headers: [
            ['set-cookie', 'one=1'],
            ['set-cookie', 'two=2'],
          ],
        }),
    );
    const response = await fetch(url, { method: 'POST', body: 'payload' });
    expect(response.status).toBe(201);
    expect(response.headers.getSetCookie()).toEqual(['one=1', 'two=2']);
    expect(await response.text()).toBe('payload');
  });
  it('cancels HEAD response bodies', async () => {
    const cancel = vi.fn();
    const url = await serve(() => new Response(new ReadableStream({ cancel })));
    const response = await fetch(url, { method: 'HEAD' });
    expect(await response.text()).toBe('');
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  });
  it('streams before completion and cancels on disconnect', async () => {
    const cancel = vi.fn();
    const url = await serve(
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('first'));
            },
            cancel,
          }),
        ),
    );
    const response = await fetch(url);
    const reader = response.body!.getReader();
    expect(new TextDecoder().decode((await reader.read()).value)).toBe('first');
    await reader.cancel();
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
  });
});
