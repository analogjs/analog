import {
  MarkdownContentRendererService,
  MarkedSetupService,
} from '@analogjs/content';
import { withShikiHighlighter } from '../index';
import { TestBed } from '@angular/core/testing';

describe('ShikiHighlighter', () => {
  function setup() {
    TestBed.configureTestingModule({
      providers: [
        MarkdownContentRendererService,
        MarkedSetupService,
        withShikiHighlighter(),
      ],
    });
    return { service: TestBed.inject(MarkdownContentRendererService) };
  }

  it('render should correctly highlight code blocks with shiki', async () => {
    const { service } = setup();

    const testCode =
      '```angular-ts\n@Component({\ntemplate: `<h1>Hello, world!</h1>`\n})\nexport class MyCmp {}\n```';
    const result = await service.render(testCode);
    expect(result).toContain(
      '<pre class="shiki shiki-themes github-light github-dark"'
    );
  });
});
