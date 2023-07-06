import { defineEventHandler } from 'h3';
export default defineEventHandler((event) => {
  const feedString = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
</rss>
  `;
  event.node.res.setHeader('content-type', 'text/xml');
  event.node.res.end(feedString);
});
