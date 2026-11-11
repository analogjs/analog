import { decodeHTML, decodeHTMLAttribute } from 'entities';
import { html } from 'satori-html';

interface ParsedNode {
  type: string;
  props: {
    children?: ParsedChild | ParsedChild[];
    [prop: string]: unknown;
  };
}

type ParsedChild = string | ParsedNode;

// satori-html leaves entities in text and attribute values undecoded.
export function parseHtml(element: string): ParsedNode {
  const node: ParsedNode = html(element);
  decodeNode(node);
  return node;
}

function decodeNode(node: ParsedNode): void {
  const { props } = node;
  for (const [key, value] of Object.entries(props)) {
    if (key !== 'children' && typeof value === 'string') {
      props[key] = decodeHTMLAttribute(value);
    }
  }

  const { children } = props;
  props.children = Array.isArray(children)
    ? children.map(decodeChild)
    : children && decodeChild(children);
}

function decodeChild(child: ParsedChild): ParsedChild {
  if (typeof child === 'string') {
    return decodeHTML(child);
  }
  decodeNode(child);
  return child;
}
