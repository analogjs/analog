import { map } from 'rxjs';
import { injectActivatedRoute } from './define-route';

const posts = import.meta.glob(['/src/content/**/*.md'], {
  as: 'raw',
  eager: true,
});

/**
 * Retrieves the static content using the provided param
 *
 * @param param route parameter (default: 'slug')
 * @param fallback fallback text if content file is not found (default: 'No Content Found')
 */
export function injectContent(param = 'slug', fallback = 'No Content Found') {
  const route = injectActivatedRoute();
  const content = route.paramMap.pipe(
    map((params) => params.get(param)),
    map((slug) => posts[`/src/content/${slug}.md`] || fallback)
  );

  return content;
}
