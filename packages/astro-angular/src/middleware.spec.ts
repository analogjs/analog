import type { APIContext } from 'astro';
import { onRequest } from './middleware';

describe('angularAstroMiddleware', () => {
  it('should move style tags to the head', async () => {
    const response = new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
        </head>
        <body>
          <astro-island>
            <!-- comment -->
            <style>.card{color:red}</style>
            <style>.card{background:blue}</style>
            <div></div>
            <!-- <style>don't move me</style> -->
          </astro-island>
        </body>
      </html>
    `,
      {
        headers: {
          'Content-Type': 'text/html',
        },
      },
    );

    const transformed = await onRequest(
      null! as APIContext,
      vi.fn().mockResolvedValue(response),
    );

    expect(transformed).toBeInstanceOf(Response);

    const body = await (transformed as Response).text();

    expect(body).toMatchInlineSnapshot(`
      "<!doctype html><html><head>
              <style>.card{color:red}</style><style>.card{background:blue}</style></head>
              <body>
                <astro-island>
                  <!-- comment -->
                  
                  
                  <div></div>
                  <!-- <style>don't move me</style> -->
                </astro-island>
              
            
          </body></html>"
    `);
  });

  it('should create a head if it is missing', async () => {
    const response = new Response(
      `
      <html>
        <body>
          <astro-island>
            <style>.card{color:red}</style>
          </astro-island>
        </body>
      </html>
    `,
      {
        headers: {
          'Content-Type': 'text/html',
        },
      },
    );

    const transformed = await onRequest(
      null! as APIContext,
      vi.fn().mockResolvedValue(response),
    );

    expect(transformed).toBeInstanceOf(Response);

    const body = await (transformed as Response).text();

    expect(body).toMatchInlineSnapshot(`
      "<html><head><style>.card{color:red}</style></head><body>
                <astro-island>
                  
                </astro-island>
              
            
          </body></html>"
    `);
  });

  it('should not move styles out of a template', async () => {
    const response = new Response(
      `
      <html>
        <body>
          <template id="custom-paragraph">
            <style>
              p {
                color: white;
                background-color: #666666;
                padding: 5px;
              }
            </style>
            <p>My paragraph</p>
          </template>
        </body>
      </html>
    `,
      {
        headers: {
          'Content-Type': 'text/html',
        },
      },
    );

    const transformed = await onRequest(
      null! as APIContext,
      vi.fn().mockResolvedValue(response),
    );

    expect(transformed).toBeInstanceOf(Response);

    const body = await (transformed as Response).text();

    expect(body).toMatchInlineSnapshot(`
      "<html><head></head><body>
                <template id="custom-paragraph">
                  <style>
                    p {
                      color: white;
                      background-color: #666666;
                      padding: 5px;
                    }
                  </style>
                  <p>My paragraph</p>
                </template>
              
            
          </body></html>"
    `);
  });

  it('should ignore responses with non-html content', async () => {
    const response = new Response(
      `
      <html>
        <head>
        </head>
        <body>
          <astro-island>
            <style>.card{color:red}</style>
          </astro-island>
        </body>
      </html>
    `,
      {
        headers: {
          'Content-Type': 'application/xml',
        },
      },
    );

    const transformed = await onRequest(
      null! as APIContext,
      vi.fn().mockResolvedValue(response),
    );

    // Should get an identical instance untouched
    expect(transformed).toBe(response);
  });

  it('should ignore responses missing a content-type', async () => {
    const response = new Response(
      `
      <html>
        <head>
        </head>
        <body>
          <astro-island>
            <style>.card{color:red}</style>
          </astro-island>
        </body>
      </html>
    `,
    );

    const transformed = await onRequest(
      null! as APIContext,
      vi.fn().mockResolvedValue(response),
    );

    // Should get an identical instance untouched
    expect(transformed).toBe(response);
  });
});
