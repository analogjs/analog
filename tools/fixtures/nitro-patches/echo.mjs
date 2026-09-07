export default {
  async fetch(request) {
    if (request.method === 'HEAD') return new Response(null);
    return Response.json({
      method: request.method,
      cookie: request.headers.get('cookie'),
      authorization: request.headers.get('authorization'),
      body: await request.text(),
    });
  },
};
