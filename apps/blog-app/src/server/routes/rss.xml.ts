import { eventHandler } from 'h3';
export default eventHandler((event) => {
  const feedString = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
</rss>
  `;

  return new Response(feedString, {
    headers: {
      'content-type': 'text/xml',
    },
  });
});
