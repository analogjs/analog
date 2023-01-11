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

  it('render should strip the attributes from a front-matter markdown input and only return the content transformed into the appropriate html', async () => {
    const { service } = setup();
    const result = await service.render(
      '----\ntitle: Test Title\ndescription: Test Description\npublishedDate: 2023-01-01\nslug: test-slug\npublished: true----\n# Hello World'
    );
    expect(result).toMatch('<h1 id="hello-world">Hello World</h1>\n');
  });
});
