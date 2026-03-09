import { defineHandler } from 'h3';

export default defineHandler((event) => {
  const feedString = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
</rss>
  `;
  event.res.headers.set('content-type', 'text/xml');

  return feedString;
});
