import MagicString from 'magic-string';

/**
 * Lower instance class field initializers into constructor assignments.
 *
 * When `useDefineForClassFields` is `false` (the standard Angular tsconfig),
 * field initializers must run as assignments inside the constructor body
 * rather than as native ES class field initializers. This ensures:
 *
 * 1. `inject()` calls in fields have an active injection context
 * 2. Fields referencing other injected fields work (sequential assignment)
 * 3. Constructor parameter properties are available to field initializers
 * 4. Inheritance works (parent constructor runs before child field assignments)
 *
 * Rules:
 * - Regular fields with initializers: remove declaration, add `this.field = value;`
 * - Private fields (`#field`) with initializers: keep `#field;` declaration, add `this.#field = value;`
 * - Static fields: not lowered
 * - Fields without initializers: not lowered
 * - `declare` fields: not lowered
 * - Assignments are inserted after `super()` (if present), before existing constructor body
 * - If no constructor exists, one is created (with `super(...args)` for subclasses)
 */
export function lowerClassFields(
  ms: MagicString,
  sourceCode: string,
  oxcProgram: any,
): void {
  for (const stmt of oxcProgram.body) {
    const decl =
      stmt.type === 'ExportNamedDeclaration' ||
      stmt.type === 'ExportDefaultDeclaration'
        ? (stmt as any).declaration
        : stmt;

    if (
      !decl ||
      (decl.type !== 'ClassDeclaration' && decl.type !== 'ClassExpression') ||
      !decl.body
    ) {
      continue;
    }

    lowerClassFieldsForClass(ms, sourceCode, decl);
  }
}

interface FieldToLower {
  /** The full property definition node */
  node: any;
  /** The field name including # prefix for private fields */
  name: string;
  /** The initializer source text */
  initializer: string;
  /** Whether this is a private field (#field) */
  isPrivate: boolean;
}

function lowerClassFieldsForClass(
  ms: MagicString,
  sourceCode: string,
  classNode: any,
): void {
  const body = classNode.body;
  const members: any[] = body.body;
  const fieldsToLower: FieldToLower[] = [];

  for (const member of members) {
    if (!shouldLowerField(member)) continue;

    const name = getFieldName(member, sourceCode);
    const initializer = sourceCode.slice(member.value.start, member.value.end);

    fieldsToLower.push({
      node: member,
      name,
      initializer,
      isPrivate:
        member.type === 'PropertyDefinition' &&
        member.key?.type === 'PrivateIdentifier',
    });
  }

  if (fieldsToLower.length === 0) return;

  // Build assignment statements
  const assignments = fieldsToLower.map(
    (f) => `    this.${f.name} = ${f.initializer};`,
  );

  // Find existing constructor
  const ctor = members.find(
    (m: any) => m.type === 'MethodDefinition' && m.kind === 'constructor',
  );

  // Check if class has a superclass
  const hasSuperClass = !!classNode.superClass;

  if (ctor) {
    insertIntoExistingConstructor(ms, sourceCode, ctor, assignments);
  } else {
    createConstructorWithAssignments(
      ms,
      sourceCode,
      body,
      members,
      assignments,
      hasSuperClass,
    );
  }

  // Remove or strip field declarations
  for (const field of fieldsToLower) {
    if (field.isPrivate) {
      // Keep declaration without initializer: `#field;`
      const eqStart = findEqualsSign(
        sourceCode,
        field.node.key.end,
        field.node.value.start,
      );
      ms.remove(eqStart, field.node.value.end);
    } else {
      // Remove the field declaration. Include up to the next newline to avoid
      // leaving blank lines, but don't eat beyond one line boundary to protect
      // MagicString appendLeft positions (e.g. Ivy static definitions at classEnd).
      let end = field.node.end;
      if (end < sourceCode.length && sourceCode[end] === '\n') end++;
      else if (
        end + 1 < sourceCode.length &&
        sourceCode[end] === '\r' &&
        sourceCode[end + 1] === '\n'
      )
        end += 2;
      ms.remove(field.node.start, end);
    }
  }
}

function shouldLowerField(member: any): boolean {
  // Must be a PropertyDefinition with an initializer (value)
  if (member.type !== 'PropertyDefinition') return false;
  if (!member.value) return false;
  // Don't lower static fields
  if (member.static) return false;
  // Don't lower declare fields
  if (member.declare) return false;

  return true;
}

function getFieldName(member: any, sourceCode: string): string {
  const key = member.key;
  if (key.type === 'PrivateIdentifier') {
    return '#' + key.name;
  }
  if (key.type === 'Identifier') {
    return key.name;
  }
  // Computed property — use the source text
  return sourceCode.slice(key.start, key.end);
}

function findEqualsSign(sourceCode: string, from: number, to: number): number {
  for (let i = from; i < to; i++) {
    if (sourceCode[i] === '=') return i;
  }
  return from;
}

function insertIntoExistingConstructor(
  ms: MagicString,
  sourceCode: string,
  ctor: any,
  assignments: string[],
): void {
  const ctorBody = ctor.value.body;
  if (!ctorBody) return;

  const bodyStatements: any[] = ctorBody.body;
  const assignmentBlock = '\n' + assignments.join('\n');

  // Find the position after super() call (if any)
  let insertPos: number | null = null;
  for (const stmt of bodyStatements) {
    if (isSuperCall(stmt)) {
      // Insert after super() statement including its semicolon
      insertPos = stmt.end;
      break;
    }
  }

  if (insertPos !== null) {
    ms.appendRight(insertPos, assignmentBlock);
  } else if (bodyStatements.length > 0) {
    // Insert before the first statement
    ms.appendRight(bodyStatements[0].start, assignments.join('\n') + '\n    ');
  } else {
    // Empty constructor body — insert after opening {
    ms.appendRight(ctorBody.start + 1, assignmentBlock + '\n  ');
  }
}

function createConstructorWithAssignments(
  ms: MagicString,
  sourceCode: string,
  classBody: any,
  members: any[],
  assignments: string[],
  hasSuperClass: boolean,
): void {
  const superCall = hasSuperClass ? '    super(...args);\n' : '';
  const args = hasSuperClass ? '...args' : '';
  const ctorCode = [
    `  constructor(${args}) {`,
    superCall ? superCall.trimEnd() : null,
    ...assignments,
    '  }',
  ]
    .filter((l) => l !== null)
    .join('\n');

  // Insert constructor at the beginning of the class body (after opening {)
  ms.appendRight(classBody.start + 1, '\n' + ctorCode + '\n');
}

function isSuperCall(stmt: any): boolean {
  if (stmt.type !== 'ExpressionStatement') return false;
  const expr = stmt.expression;
  if (expr.type !== 'CallExpression') return false;
  return expr.callee?.type === 'Super';
}
