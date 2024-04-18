import { TestBed } from '@angular/core/testing';

import { MarkdownContentRendererService } from './markdown-content-renderer.service';
import { MarkedSetupService } from './marked-setup.service';
import { RenderTaskService } from './render-task.service';

describe('MarkdownContentRendererService', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [
        MarkdownContentRendererService,
        MarkedSetupService,
        RenderTaskService,
      ],
    });
    return { service: TestBed.inject(MarkdownContentRendererService) };
  }

  it('render should transform raw markdown input into the appropriate html', async () => {
    const { service } = setup();
    const result = await service.render('# Hello World');
    expect(result).toMatch('<h1 id="hello-world">Hello World</h1>\n');
  });

  it('should transform markdown and return a TOC', async () => {
    const { service } = setup();
    const content = `
# Level 1 
## Level 2

lorem ipsum .... 

# Level 1
## Level 2
### Level 3 ?? complex test && &@@

Lorem ipsum 2....
    `;

    const result = await service.render(content);
    expect(result).toMatch('<h1 id="level-1">Level 1</h1>');

    const toc = service.getContentHeadings();
    expect(toc.length).toBe(5);
    expect(toc[0].id).toBe('level-1');
    expect(toc[0].text).toBe('Level 1');
    expect(toc[0].level).toBe(1);
    expect(toc[3].level).toBe(2);
    expect(toc[4].level).toBe(3);

    expect(toc[4].id).toBe('level-3--complex-test--');
    expect(result).toMatch('id="level-3--complex-test--"');
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
