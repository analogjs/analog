import { eventHandler } from 'h3';

// Proper middleware example following H3 best practices
// Note: H3 docs say "Middleware pattern is not recommended for h3 in general"
export default eventHandler((event) => {
  // Add user context to all requests (this is just an example)
  event.context.user = { name: 'Analog User' };

  // Add a custom header to all responses
  event.node.res.setHeader('X-Powered-By', 'AnalogJS');

  // Middleware MUST NOT return anything - this allows the request to continue
  // to the next middleware or route handler
});
