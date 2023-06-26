import { MarkdownContentRendererService } from './markdown-content-renderer.service';
import { TestBed } from '@angular/core/testing';

describe('MarkdownContentRendererService', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [MarkdownContentRendererService],
    });
    return { service: TestBed.inject(MarkdownContentRendererService) };
  }

  it('render should transform raw markdown input into the appropriate html', async () => {
    const { service } = setup();
    const result = await service.render('# Hello World');
    expect(result).toMatch('<h1 id="hello-world">Hello World</h1>\n');
  });

  it('render should correctly highlight code blocks', async () => {
    const { service } = setup();
    let testCode = "```javascript\nconsole.log('Hello, world!');\n```";
    let result = await service.render(testCode);

    expect(result).toContain(
      '<pre class="language-javascript"><code class="language-javascript">'
    );

    testCode = "```typescript\nconsole.log('Hello, world!');\n```";
    result = await service.render(testCode);

    expect(result).toContain(
      '<pre class="language-typescript"><code class="language-typescript">'
    );
  });
});
