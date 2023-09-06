import { MarkdownContentRendererService } from './markdown-content-renderer.service';
import { TestBed } from '@angular/core/testing';
import { MarkedSetupService } from './marked-setup.service';

describe('MarkdownContentRendererService', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [MarkdownContentRendererService, MarkedSetupService],
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

  it('render should correctly highlight diff code blocks', async () => {
    const { service } = setup();
    window.Prism.languages['diff'] = {};
    let testCode = "```diff-javascript\nconsole.log('Hello, world!');\n```";
    let result = await service.render(testCode);

    expect(result).toContain(
      '<pre class="language-diff-javascript diff-highlight"><code class="language-diff-javascript diff-highlight">'
    );

    testCode = "```diff-typescript\nconsole.log('Hello, world!');\n```";
    result = await service.render(testCode);

    expect(result).toContain(
      '<pre class="language-diff-typescript diff-highlight"><code class="language-diff-typescript diff-highlight">'
    );
  });

  it('render should fall back to language-only highlighting if `diff` plugin is not imported', async () => {
    const { service } = setup();
    window.Prism.languages['diff'] = undefined;
    let testCode = "```diff-javascript\nconsole.log('Hello, world!');\n```";
    let result = await service.render(testCode);

    expect(result).toContain(
      '<pre class="language-javascript"><code class="language-javascript">'
    );

    testCode = "```diff-typescript\nconsole.log('Hello, world!');\n```";
    result = await service.render(testCode);

    expect(result).toContain(
      '<pre class="language-typescript"><code class="language-typescript">'
    );
  });
});
