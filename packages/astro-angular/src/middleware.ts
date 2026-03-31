import type { MiddlewareHandler } from 'astro';
import type { Root, RootContent, Element } from 'hast';
import { rehype } from 'rehype';

const processor = rehype();

export const onRequest: MiddlewareHandler = async (_ctx, next) => {
  const response = await next();
  if (response.headers.get('content-type')?.includes('text/html') !== true) {
    return response;
  }

  // Find all <style ng-app-id="..."> tags in the body and move them to the head

  const responseBody = await response.text();

  const tree = processor.parse(responseBody);

  const stack: (Root | RootContent)[] = [tree];

  const styleTags: Element[] = [];
  let head: Element | null = null;

  while (stack.length) {
    const top = stack.pop()!;

    if (top.type === 'element' && top.tagName === 'template') {
      // Templates create a shadow-root, so styles should not be moved outside.
      continue;
    }

    if (top.type === 'element' && top.tagName === 'style') {
      if ('ng-app-id' in top.properties) {
        styleTags.push(top);
      }
      continue;
    }

    if (top.type === 'element' && top.tagName === 'head' && !head) {
      head = top;
      continue;
    }

    if (top.type !== 'root' && top.type !== 'element') {
      continue;
    }

    for (let index = top.children.length - 1; index >= 0; index--) {
      const child = top.children[index];

      stack.push(child);

      if (
        child.type === 'element' &&
        child.tagName === 'style' &&
        'ng-app-id' in child.properties
      ) {
        top.children.splice(index, 1);
      }
    }
  }

  if (head) {
    head.children.push(...styleTags);
  } else {
    const head: Element = {
      type: 'element',
      children: styleTags,
      properties: {},
      tagName: 'head',
    };

    tree.children.unshift(head);
  }

  const newBody = processor.stringify(tree);

  return new Response(newBody, response);
};
