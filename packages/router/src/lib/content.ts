import { map } from 'rxjs';
import { injectActivatedRoute } from './define-route';

const posts = import.meta.glob(['/src/content/**/*.md'], {
  as: 'raw',
  eager: true,
});

export function injectContent(param = 'slug') {
  const route = injectActivatedRoute();
  const content = route.paramMap.pipe(
    map((params) => params.get(param)),
    map((slug) => posts[`/src/content/${slug}.md`] || 'No Content Found')
  );

  return content;
}
