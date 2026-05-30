import { parseSync } from 'oxc-parser';

export interface ComponentDecorator {
  argsRange: [number, number];
  className: string;
}

interface DecoratorMatch {
  className: string;
  call: any;
}

const PARSE_FILENAME = 'oxc-hmr-helpers.ts';

function parseProgram(code: string): any {
  return parseSync(PARSE_FILENAME, code).program;
}

function* iterateComponentDecorators(
  program: any,
): Generator<DecoratorMatch, void, void> {
  for (const node of program.body) {
    const decl =
      node.type === 'ExportNamedDeclaration' ||
      node.type === 'ExportDefaultDeclaration'
        ? node.declaration
        : node;
    if (!decl || decl.type !== 'ClassDeclaration' || !decl.id?.name) continue;
    const className: string = decl.id.name;
    for (const dec of decl.decorators || []) {
      const call = dec.expression;
      if (call?.type !== 'CallExpression') continue;
      if (
        call.callee?.type !== 'Identifier' ||
        call.callee.name !== 'Component'
      )
        continue;
      yield { className, call };
    }
  }
}

function callArgsRange(code: string, call: any): [number, number] {
  let openParen = call.callee.end;
  while (openParen < call.end && code[openParen] !== '(') openParen++;
  return [openParen, call.end - 1];
}

function getObjectArg(call: any): any | null {
  const arg = call.arguments?.[0];
  return arg?.type === 'ObjectExpression' ? arg : null;
}

function findProperty(obj: any, name: string): any | null {
  for (const prop of obj.properties || []) {
    if (prop.type !== 'Property' || prop.computed) continue;
    const key = prop.key;
    if (key?.type === 'Identifier' && key.name === name) return prop;
    if (key?.type === 'Literal' && key.value === name) return prop;
  }
  return null;
}

function rangeOf(node: any): [number, number] {
  return [node.start, node.end - 1];
}

function findClassDecorator(
  code: string,
  className: string,
): DecoratorMatch | null {
  for (const match of iterateComponentDecorators(parseProgram(code))) {
    if (match.className === className) return match;
  }
  return null;
}

export function locateComponentDecorators(code: string): ComponentDecorator[] {
  const out: ComponentDecorator[] = [];
  for (const { className, call } of iterateComponentDecorators(
    parseProgram(code),
  )) {
    out.push({ argsRange: callArgsRange(code, call), className });
  }
  return out;
}

function locateValueRangeForField(
  call: any,
  field: 'template' | 'styles',
): [number, number] | null {
  const obj = getObjectArg(call);
  if (!obj) return null;
  const prop = findProperty(obj, field);
  if (!prop) return null;
  const value = prop.value;
  if (field === 'template') {
    if (value?.type === 'Literal' && typeof value.value === 'string')
      return rangeOf(value);
    if (value?.type === 'TemplateLiteral') return rangeOf(value);
    return null;
  }
  if (
    value?.type === 'ArrayExpression' ||
    value?.type === 'TemplateLiteral' ||
    (value?.type === 'Literal' && typeof value.value === 'string')
  ) {
    return rangeOf(value);
  }
  return null;
}

export function locateStylesInArgs(
  code: string,
  argsRange: [number, number],
): [number, number] | null {
  const program = parseProgram(code);
  for (const { call } of iterateComponentDecorators(program)) {
    const [open, close] = callArgsRange(code, call);
    if (open === argsRange[0] && close === argsRange[1]) {
      return locateValueRangeForField(call, 'styles');
    }
  }
  return null;
}

export function extractInlineTemplate(
  code: string,
  className: string,
): string | null {
  const match = findClassDecorator(code, className);
  if (!match) return null;
  const range = locateValueRangeForField(match.call, 'template');
  if (!range) return null;
  return code.slice(range[0] + 1, range[1]);
}

function rawInner(code: string, node: any): string {
  return code.slice(node.start + 1, node.end - 1);
}

function collectRawStringsInArray(code: string, arr: any): string[] {
  const out: string[] = [];
  for (const el of arr.elements || []) {
    if (!el) continue;
    if (
      (el.type === 'Literal' && typeof el.value === 'string') ||
      el.type === 'TemplateLiteral'
    ) {
      out.push(rawInner(code, el));
    }
  }
  return out;
}

export function extractInlineStyles(
  code: string,
  className: string,
): string[] | null {
  const match = findClassDecorator(code, className);
  if (!match) return null;
  const obj = getObjectArg(match.call);
  if (!obj) return null;
  const prop = findProperty(obj, 'styles');
  if (!prop) return null;
  const value = prop.value;
  if (value?.type === 'ArrayExpression') {
    const styles = collectRawStringsInArray(code, value);
    return styles.length > 0 ? styles : null;
  }
  if (
    (value?.type === 'Literal' && typeof value.value === 'string') ||
    value?.type === 'TemplateLiteral'
  ) {
    return [rawInner(code, value)];
  }
  return null;
}

export function stripComponentMetadata(code: string): string {
  const program = parseProgram(code);
  const ranges: Array<[number, number]> = [];
  for (const { call } of iterateComponentDecorators(program)) {
    const tpl = locateValueRangeForField(call, 'template');
    if (tpl) ranges.push(tpl);
    const styles = locateValueRangeForField(call, 'styles');
    if (styles) ranges.push(styles);
  }
  ranges.sort((a, b) => b[0] - a[0]);
  let out = code;
  for (const [start, end] of ranges) {
    out = out.slice(0, start + 1) + out.slice(end);
  }
  return out;
}
