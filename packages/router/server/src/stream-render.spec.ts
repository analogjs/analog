import { describe, expect, it } from 'vitest';
import { splitHtmlIntoChunks, createStreamingResponse } from './stream-render';

describe('splitHtmlIntoChunks', () => {
  it('should split HTML at the analog-outlet marker', () => {
    const html = '<html><head></head><body><!--analog-outlet--></body></html>';
    const { shell, remainder } = splitHtmlIntoChunks(html);

    expect(shell).toBe('<html><head></head><body><!--analog-outlet-->');
    expect(remainder).toBe('</body></html>');
  });

  it('should return full HTML as shell when no marker is found', () => {
    const html = '<html><head></head><body></body></html>';
    const { shell, remainder } = splitHtmlIntoChunks(html);

    expect(shell).toBe(html);
    expect(remainder).toBe('');
  });

  it('should handle custom markers', () => {
    const html = '<html><!--app-root--></html>';
    const { shell, remainder } = splitHtmlIntoChunks(html, '<!--app-root-->');

    expect(shell).toBe('<html><!--app-root-->');
    expect(remainder).toBe('</html>');
  });

  it('should handle marker at the start of the string', () => {
    const html = '<!--analog-outlet-->content';
    const { shell, remainder } = splitHtmlIntoChunks(html);

    expect(shell).toBe('<!--analog-outlet-->');
    expect(remainder).toBe('content');
  });

  it('should handle marker at the end of the string', () => {
    const html = 'content<!--analog-outlet-->';
    const { shell, remainder } = splitHtmlIntoChunks(html);

    expect(shell).toBe('content<!--analog-outlet-->');
    expect(remainder).toBe('');
  });

  it('should handle empty string', () => {
    const { shell, remainder } = splitHtmlIntoChunks('');

    expect(shell).toBe('');
    expect(remainder).toBe('');
  });

  it('should only split at the first occurrence of the marker', () => {
    const html = '<!--analog-outlet-->content<!--analog-outlet-->extra';
    const { shell, remainder } = splitHtmlIntoChunks(html);

    expect(shell).toBe('<!--analog-outlet-->');
    expect(remainder).toBe('content<!--analog-outlet-->extra');
  });
});

describe('createStreamingResponse', () => {
  it('should return a Response with a ReadableStream body', async () => {
    const html = '<html><!--analog-outlet--></html>';
    const response = createStreamingResponse(html);

    expect(response).toBeInstanceOf(Response);
    expect(response.body).toBeInstanceOf(ReadableStream);
  });

  it('should default to status 200', () => {
    const html = '<html></html>';
    const response = createStreamingResponse(html);

    expect(response.status).toBe(200);
  });

  it('should set Content-Type to text/html', () => {
    const html = '<html></html>';
    const response = createStreamingResponse(html);

    expect(response.headers.get('Content-Type')).toBe('text/html');
  });

  it('should set Transfer-Encoding to chunked', () => {
    const html = '<html></html>';
    const response = createStreamingResponse(html);

    expect(response.headers.get('Transfer-Encoding')).toBe('chunked');
  });

  it('should include custom headers', () => {
    const html = '<html></html>';
    const response = createStreamingResponse(html, {
      'X-Custom-Header': 'custom-value',
    });

    expect(response.headers.get('X-Custom-Header')).toBe('custom-value');
  });

  it('should allow overriding Content-Type via headers', () => {
    const html = '<html></html>';
    const response = createStreamingResponse(html, {
      'Content-Type': 'application/xhtml+xml',
    });

    expect(response.headers.get('Content-Type')).toBe('application/xhtml+xml');
  });

  it('should stream the full HTML content', async () => {
    const html = '<html><!--analog-outlet--><body>content</body></html>';
    const response = createStreamingResponse(html);

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let result = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value, { stream: true });
    }

    expect(result).toBe(html);
  });

  it('should stream HTML without outlet marker as single chunk', async () => {
    const html = '<html><body>content</body></html>';
    const response = createStreamingResponse(html);

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let result = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value, { stream: true });
    }

    expect(result).toBe(html);
  });

  it('should handle empty HTML', async () => {
    const response = createStreamingResponse('');

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let result = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      result += decoder.decode(value, { stream: true });
    }

    expect(result).toBe('');
  });
});
