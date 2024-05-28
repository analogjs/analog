import {
  MarkdownContentRendererService,
  MarkedContentHighlighter,
  MarkedSetupService,
} from '@analogjs/content';
import { TestBed } from '@angular/core/testing';
import { withPrismHighlighter } from '../index';

describe('PrismHighlighter', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [
        MarkdownContentRendererService,
        MarkedSetupService,
        withPrismHighlighter(),
      ],
    });
    return { service: TestBed.inject(MarkdownContentRendererService) };
  }

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
    delete window.Prism.languages['diff'];
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
