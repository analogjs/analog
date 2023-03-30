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
});
