import { parseSync } from 'oxc-parser';

// Component metadata fields the Angular CLI updates in place
const HMR_FIELDS = new Set([
  'template',
  'templateUrl',
  'styles',
  'styleUrl',
  'stylesUrl',
]);

interface Source {
  text: string;
  body: any[];
}

type Fields = [name: string, value: string][];

function parse(filename: string, text: string): Source | null {
  const { program, errors } = parseSync(filename, text);
  return errors.length ? null : { text, body: program.body };
}

function classOf(statement: any) {
  if (statement.type === 'ClassDeclaration') return statement;
  return statement.declaration?.type === 'ClassDeclaration'
    ? statement.declaration
    : undefined;
}

// Decorators written before `export` fall outside the statement span
function statementStart(statement: any) {
  return Math.min(
    statement.start,
    classOf(statement)?.decorators[0]?.start ?? statement.start,
  );
}

function statementText(source: Source, statement: any) {
  return source.text.slice(statementStart(statement), statement.end);
}

// The statement without its decorator and class body
function classHeader(source: Source, statement: any, cls: any) {
  const [decorator] = cls.decorators;
  return (
    source.text.slice(statementStart(statement), decorator.start) +
    source.text.slice(decorator.end, cls.body.start) +
    source.text.slice(cls.body.end, statement.end)
  );
}

function decoratorMetadata(source: Source, decorator: any) {
  const call = decorator.expression;
  const metadata = call.arguments?.[0];
  if (call.arguments?.length !== 1 || metadata.type !== 'ObjectExpression') {
    return null;
  }
  const fields: Fields = [];
  for (const property of metadata.properties) {
    if (
      property.type !== 'Property' ||
      property.kind !== 'init' ||
      property.computed ||
      property.shorthand ||
      property.method
    ) {
      return null;
    }
    fields.push([
      String(property.key.name ?? property.key.value),
      source.text.slice(property.value.start, property.value.end),
    ]);
  }
  return {
    callee: source.text.slice(call.callee.start, call.callee.end),
    fields,
  };
}

function fieldsText(fields: Fields, hmr: boolean) {
  const selected = fields.filter(([name]) => HMR_FIELDS.has(name) === hmr);
  // HMR fields can move; other fields must keep their order
  if (hmr) selected.sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(selected);
}

/**
 * Whether a component changed only in its HMR fields, or `null` when
 * anything else in the statement changed.
 */
function componentChanged(
  stale: Source,
  staleStatement: any,
  updated: Source,
  updatedStatement: any,
): boolean | null {
  const staleClass = classOf(staleStatement);
  const updatedClass = classOf(updatedStatement);
  if (
    staleStatement.type !== updatedStatement.type ||
    staleClass?.decorators.length !== 1 ||
    updatedClass.decorators.length !== 1 ||
    classHeader(stale, staleStatement, staleClass) !==
      classHeader(updated, updatedStatement, updatedClass) ||
    stale.text.slice(staleClass.body.start, staleClass.body.end) !==
      updated.text.slice(updatedClass.body.start, updatedClass.body.end)
  ) {
    return null;
  }
  const staleMeta = decoratorMetadata(stale, staleClass.decorators[0]);
  const updatedMeta = decoratorMetadata(updated, updatedClass.decorators[0]);
  if (
    !staleMeta ||
    !updatedMeta ||
    staleMeta.callee !== updatedMeta.callee ||
    fieldsText(staleMeta.fields, false) !==
      fieldsText(updatedMeta.fields, false)
  ) {
    return null;
  }
  return (
    fieldsText(staleMeta.fields, true) !== fieldsText(updatedMeta.fields, true)
  );
}

/**
 * Applies the Angular CLI's HMR rule to an edited file. Returns the
 * components whose `template`, `templateUrl`, `styles`, `styleUrl` or
 * `stylesUrl` fields are the only changes, or `null` when the edit
 * needs a full reload.
 */
export function findHmrComponentUpdates(
  filename: string,
  staleText: string,
  updatedText: string,
  components: ReadonlySet<string>,
): string[] | null {
  const stale = parse(filename, staleText);
  const updated = parse(filename, updatedText);
  if (!stale || !updated || stale.body.length !== updated.body.length) {
    return null;
  }
  const changed: string[] = [];
  for (let i = 0; i < updated.body.length; i++) {
    const name = classOf(updated.body[i])?.id?.name;
    if (name && components.has(name)) {
      const result = componentChanged(
        stale,
        stale.body[i],
        updated,
        updated.body[i],
      );
      if (result === null) return null;
      if (result) changed.push(name);
    } else if (
      statementText(stale, stale.body[i]) !==
      statementText(updated, updated.body[i])
    ) {
      return null;
    }
  }
  return changed.length ? changed : null;
}
