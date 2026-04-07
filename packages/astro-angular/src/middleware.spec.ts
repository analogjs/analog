import type { APIContext } from 'astro';
import { onRequest } from './middleware.ts';

describe('angularAstroMiddleware', () => {
  it('should move angular style tags to the head', async () => {
    const response = new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
        </head>
        <body>
          <astro-island>
            <!-- comment -->
            <style ng-app-id="ng">.card{color:red}</style>
            <style ng-app-id="ng">.card{background:blue}</style>
            <style>.card{border:1px solid black;}</style>
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
              <style ng-app-id="ng">.card{color:red}</style><style ng-app-id="ng">.card{background:blue}</style></head>
              <body>
                <astro-island>
                  <!-- comment -->
                  
                  
                  <style>.card{border:1px solid black;}</style>
                  <div></div>
                  <!-- <style>don't move me</style> -->
                </astro-island>
              
            
          </body></html>"
    `);
  });

  it('should preserve style order of adjacent islands', async () => {
    const response = new Response(
      `
      <!DOCTYPE html>
      <html>
        <head>
        </head>
        <body>
          <astro-island>
            <style ng-app-id="ng">style-1</style>
          </astro-island>
          <astro-island>
            <style ng-app-id="ng">style-2</style>
            <style ng-app-id="ng">style-3</style>
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
              <style ng-app-id="ng">style-1</style><style ng-app-id="ng">style-2</style><style ng-app-id="ng">style-3</style></head>
              <body>
                <astro-island>
                  
                </astro-island>
                <astro-island>
                  
                  
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
            <style ng-app-id="ng">.card{color:red}</style>
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
      "<html><head><style ng-app-id="ng">.card{color:red}</style></head><body>
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
            <style ng-app-id="ng">
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
                  <style ng-app-id="ng">
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
            <style ng-app-id="ng">.card{color:red}</style>
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
            <style ng-app-id="ng">.card{color:red}</style>
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

  it('should update the content-length header', async () => {
    const response = new Response(
      `      
      <html>
        <head>
        </head>
        <body>
          <astro-island>
            <style ng-app-id="ng">.card{color:red}</style>
            🔥
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
      "<html><head>
              <style ng-app-id="ng">.card{color:red}</style></head>
              <body>
                <astro-island>
                  
                  🔥
                </astro-island>
              
            
          </body></html>"
    `);

    // Since the text contains emoji, it should _not_ use the number of characters in the string, but rather the number of bytes.
    expect((transformed as Response).headers.get('content-length')).not.toBe(
      body.length.toFixed(0),
    );
    expect((transformed as Response).headers.get('content-length')).toBe('205');
  });
});
