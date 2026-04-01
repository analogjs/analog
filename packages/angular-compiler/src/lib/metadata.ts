import * as ts from 'typescript';
import * as o from '@angular/compiler';
import { unwrapForwardRef } from './utils.js';

/**
 * Extract decorator metadata from an Angular decorator AST node.
 * Parses @Component, @Directive, @Pipe, @Injectable, @NgModule arguments.
 */
export function extractMetadata(dec: ts.Decorator | undefined): any {
  if (!dec) return null;
  const call = dec.expression as ts.CallExpression;
  const obj = call.arguments[0] as ts.ObjectLiteralExpression;
  const meta: any = {
    hostRaw: {},
    inputs: {},
    outputs: {},
    standalone: true,
    imports: [],
    providers: null,
    viewProviders: null,
    animations: null,
    changeDetection: 1,
    encapsulation: 0,
    preserveWhitespaces: false,
    exportAs: null,
    selector: undefined,
    styles: [],
    templateUrl: null,
    styleUrls: [],
  };
  if (!obj) return meta;
  obj.properties.forEach((p) => {
    if (!ts.isPropertyAssignment(p)) return;
    const key = p.name.getText().replace(/['"`]/g, ''),
      valNode = p.initializer,
      valText = valNode.getText();
    switch (key) {
      case 'host':
        if (ts.isObjectLiteralExpression(valNode))
          valNode.properties.forEach((hp) => {
            if (ts.isPropertyAssignment(hp))
              meta.hostRaw[hp.name.getText().replace(/['"`]/g, '')] =
                hp.initializer.getText().replace(/['"`]/g, '');
          });
        break;
      case 'changeDetection':
        meta.changeDetection = valText.includes('OnPush') ? 0 : 1;
        break;
      case 'encapsulation':
        meta.encapsulation = valText.includes('None')
          ? 2
          : valText.includes('ShadowDom')
            ? 3
            : 0;
        break;
      case 'preserveWhitespaces':
        meta.preserveWhitespaces = valText === 'true';
        break;
      case 'pure':
      case 'standalone':
        meta[key] = valText !== 'false';
        break;
      case 'template':
      case 'selector':
      case 'name':
      case 'exportAs':
      case 'templateUrl':
      case 'providedIn':
        // Extract the actual string content, preserving internal quotes
        if (
          ts.isStringLiteral(valNode) ||
          ts.isNoSubstitutionTemplateLiteral(valNode)
        ) {
          meta[key] = valNode.text;
        } else {
          meta[key] = valText.replace(/['"`]/g, '');
        }
        if (key === 'exportAs') meta.exportAs = [meta.exportAs];
        break;
      case 'styleUrl':
        // Angular supports singular styleUrl as shorthand
        if (
          ts.isStringLiteral(valNode) ||
          ts.isNoSubstitutionTemplateLiteral(valNode)
        ) {
          meta.styleUrls = [valNode.text];
        } else {
          meta.styleUrls = [valText.replace(/['"`]/g, '')];
        }
        break;
      case 'styleUrls':
        if (ts.isArrayLiteralExpression(valNode))
          meta.styleUrls = valNode.elements.map((e) =>
            ts.isStringLiteral(e) ? e.text : e.getText().replace(/['"`]/g, ''),
          );
        break;
      case 'styles':
        if (ts.isArrayLiteralExpression(valNode)) {
          meta.styles = valNode.elements.map((e) =>
            ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e)
              ? e.text
              : e.getText().replace(/['"`]/g, ''),
          );
        } else if (
          ts.isStringLiteral(valNode) ||
          ts.isNoSubstitutionTemplateLiteral(valNode)
        ) {
          // Angular supports singular styles as a string
          meta.styles = [valNode.text];
        }
        break;
      case 'imports':
      case 'providers':
      case 'viewProviders':
      case 'animations':
      case 'rawImports':
      case 'declarations':
      case 'exports':
      case 'bootstrap':
        if (ts.isArrayLiteralExpression(valNode))
          meta[key] = valNode.elements.map(
            (e) => new o.WrappedNodeExpr(unwrapForwardRef(e as ts.Expression)),
          );
        break;
      default:
        meta[key] = valText.replace(/['"`]/g, '');
    }
  });
  return meta;
}

/**
 * Detect signal-based APIs on class members: input(), model(), output(),
 * viewChild(), contentChild(), viewChildren(), contentChildren().
 */
export function detectSignals(node: ts.ClassDeclaration) {
  const inputs: any = {},
    outputs: any = {},
    viewQueries: any[] = [],
    contentQueries: any[] = [];

  node.members.forEach((m) => {
    if (
      ts.isPropertyDeclaration(m) &&
      m.initializer &&
      ts.isCallExpression(m.initializer)
    ) {
      const name = m.name.getText();
      const callExpr = m.initializer.expression.getText();

      // 1. SIGNAL INPUTS (Standard & Required)
      if (callExpr.includes('input')) {
        const isRequired = callExpr.includes('.required');
        // Extract transform from options: input(val, { transform }) or input.required({ transform })
        let transform: any = null;
        const optionsArg = isRequired
          ? m.initializer.arguments[0]
          : m.initializer.arguments[1];
        if (optionsArg && ts.isObjectLiteralExpression(optionsArg)) {
          for (const prop of optionsArg.properties) {
            if (
              ts.isPropertyAssignment(prop) &&
              prop.name.getText() === 'transform'
            ) {
              transform = new o.WrappedNodeExpr(prop.initializer);
            }
          }
        }
        inputs[name] = {
          classPropertyName: name,
          bindingPropertyName: name,
          isSignal: true,
          required: isRequired,
          transform,
        };
      }

      // 2. MODEL SIGNALS (Writable Inputs)
      else if (callExpr.includes('model')) {
        // Models are signals (flag 3) and generate an automatic output
        inputs[name] = {
          classPropertyName: name,
          bindingPropertyName: name,
          isSignal: true,
        };
        outputs[name + 'Change'] = name + 'Change';
      }

      // 3. SIGNAL QUERIES (viewChild, contentChild)
      else if (callExpr.includes('Child') || callExpr.includes('Children')) {
        const isSignalQuery =
          callExpr.includes('viewChild') ||
          callExpr.includes('contentChild') ||
          callExpr.includes('viewChildren') ||
          callExpr.includes('contentChildren');

        const query = {
          propertyName: name,
          predicate: ts.isStringLiteral(m.initializer.arguments[0])
            ? [m.initializer.arguments[0].text]
            : new o.WrappedNodeExpr(m.initializer.arguments[0]),
          first: !callExpr.includes('ren'), // Children vs Child
          descendants: true,
          read: null,
          static: false,
          emitFlags: 0,
          isSignal: isSignalQuery, // Critical for v21 query reactivity
        };

        if (callExpr.includes('view')) viewQueries.push(query);
        else contentQueries.push(query);
      }

      // 4. STANDARD OUTPUTS (output() and outputFromObservable())
      else if (
        callExpr.includes('output') ||
        callExpr.includes('outputFromObservable')
      ) {
        // Extract alias from options: output({alias: 'publicName'})
        let alias = name;
        const optArg = m.initializer.arguments[0];
        if (optArg && ts.isObjectLiteralExpression(optArg)) {
          for (const prop of optArg.properties) {
            if (
              ts.isPropertyAssignment(prop) &&
              prop.name.getText() === 'alias' &&
              ts.isStringLiteral(prop.initializer)
            ) {
              alias = prop.initializer.text;
            }
          }
        }
        outputs[name] = alias;
      }
    }
  });

  return { inputs, outputs, viewQueries, contentQueries };
}

/**
 * Detect decorator-based field metadata: @Input, @Output, @ViewChild,
 * @ContentChild, @ViewChildren, @ContentChildren, @HostBinding, @HostListener.
 */
export function detectFieldDecorators(node: ts.ClassDeclaration) {
  const inputs: any = {};
  const outputs: any = {};
  const viewQueries: any[] = [];
  const contentQueries: any[] = [];
  const hostProperties: Record<string, string> = {};
  const hostListeners: Record<string, string> = {};

  for (const member of node.members) {
    const decorators = ts.getDecorators(member as any);
    if (!decorators) continue;

    const memberName = member.name?.getText() || '';

    for (const dec of decorators) {
      if (!ts.isCallExpression(dec.expression)) continue;
      const decName = dec.expression.expression.getText();
      const args = dec.expression.arguments;

      switch (decName) {
        case 'Input': {
          let bindingName = memberName;
          let required = false;
          let transformFunction: any = null;

          if (args.length > 0) {
            const arg = args[0];
            if (ts.isStringLiteral(arg)) {
              bindingName = arg.text;
            } else if (ts.isObjectLiteralExpression(arg)) {
              for (const prop of arg.properties) {
                if (!ts.isPropertyAssignment(prop)) continue;
                const key = prop.name.getText();
                if (key === 'alias' && ts.isStringLiteral(prop.initializer))
                  bindingName = prop.initializer.text;
                if (key === 'required')
                  required = prop.initializer.getText() === 'true';
                if (key === 'transform')
                  transformFunction = new o.WrappedNodeExpr(prop.initializer);
              }
            }
          }

          inputs[memberName] = {
            classPropertyName: memberName,
            bindingPropertyName: bindingName,
            isSignal: false,
            required,
            transformFunction,
          };
          break;
        }

        case 'Output': {
          const alias =
            args.length > 0 && ts.isStringLiteral(args[0])
              ? args[0].text
              : memberName;
          outputs[memberName] = alias;
          break;
        }

        case 'ViewChild':
        case 'ViewChildren':
        case 'ContentChild':
        case 'ContentChildren': {
          const isView = decName.startsWith('View');
          const isFirst = decName === 'ViewChild' || decName === 'ContentChild';

          let predicate: any = memberName;
          if (args.length > 0) {
            const pred = args[0];
            if (ts.isStringLiteral(pred)) {
              predicate = [pred.text];
            } else {
              predicate = new o.WrappedNodeExpr(
                unwrapForwardRef(pred as ts.Expression),
              );
            }
          }

          let read: any = null;
          let isStatic = false;
          let descendants = isView || isFirst; // ContentChildren defaults to false

          if (args.length > 1 && ts.isObjectLiteralExpression(args[1])) {
            for (const prop of (args[1] as ts.ObjectLiteralExpression)
              .properties) {
              if (!ts.isPropertyAssignment(prop)) continue;
              const key = prop.name.getText();
              if (key === 'read')
                read = new o.WrappedNodeExpr(prop.initializer);
              if (key === 'static')
                isStatic = prop.initializer.getText() === 'true';
              if (key === 'descendants')
                descendants = prop.initializer.getText() === 'true';
            }
          }

          const query = {
            propertyName: memberName,
            predicate,
            first: isFirst,
            descendants,
            read,
            static: isStatic,
            emitFlags: 0,
            isSignal: false,
          };

          if (isView) viewQueries.push(query);
          else contentQueries.push(query);
          break;
        }

        case 'HostBinding': {
          const target =
            args.length > 0 && ts.isStringLiteral(args[0])
              ? args[0].text
              : memberName;
          hostProperties[target] = memberName;
          break;
        }

        case 'HostListener': {
          if (args.length > 0 && ts.isStringLiteral(args[0])) {
            const event = args[0].text;
            let handler = `${memberName}()`;
            if (args.length > 1 && ts.isArrayLiteralExpression(args[1])) {
              const handlerArgs = args[1].elements
                .filter(ts.isStringLiteral)
                .map((e) => e.text)
                .join(', ');
              handler = `${memberName}(${handlerArgs})`;
            }
            hostListeners[event] = handler;
          }
          break;
        }
      }
    }
  }

  return {
    inputs,
    outputs,
    viewQueries,
    contentQueries,
    hostProperties,
    hostListeners,
  };
}

/**
 * Analyze constructor parameters for dependency injection.
 * Returns:
 * - R3DependencyMetadata[] for normal constructors
 * - null if class extends another without own constructor (use inherited factory)
 * - 'invalid' if any parameter has a type-only import token
 */
export function extractConstructorDeps(
  node: ts.ClassDeclaration,
  typeOnlyImports: Set<string>,
): any[] | 'invalid' | null {
  const hasSuper = node.heritageClauses?.some(
    (h) => h.token === ts.SyntaxKind.ExtendsKeyword,
  );
  const ctor = node.members.find(ts.isConstructorDeclaration) as
    | ts.ConstructorDeclaration
    | undefined;

  if (!ctor) {
    return hasSuper ? null : []; // Inherited factory or zero-arg
  }

  const deps: any[] = [];
  let invalid = false;

  for (const param of ctor.parameters) {
    let token: string | null = null;
    let attributeNameType: any = null;
    let host = false,
      optional = false,
      self = false,
      skipSelf = false;

    // Extract type annotation as token
    if (param.type && ts.isTypeReferenceNode(param.type)) {
      token = param.type.typeName.getText();
    } else if (param.type && ts.isUnionTypeNode(param.type)) {
      // Handle `Service | null` — find first TypeReference
      for (const t of param.type.types) {
        if (ts.isTypeReferenceNode(t)) {
          token = t.typeName.getText();
          break;
        }
      }
    }

    // Process parameter decorators
    const paramDecorators = ts.getDecorators(param);
    if (paramDecorators) {
      for (const dec of paramDecorators) {
        if (!ts.isCallExpression(dec.expression)) continue;
        const decName = dec.expression.expression.getText();
        const args = dec.expression.arguments;

        switch (decName) {
          case 'Inject':
            if (args.length > 0) {
              if (ts.isStringLiteral(args[0])) {
                token = args[0].text;
              } else {
                token = args[0].getText();
              }
            }
            break;
          case 'Optional':
            optional = true;
            break;
          case 'Self':
            self = true;
            break;
          case 'SkipSelf':
            skipSelf = true;
            break;
          case 'Host':
            host = true;
            break;
          case 'Attribute':
            if (args.length > 0 && ts.isStringLiteral(args[0])) {
              attributeNameType = new o.LiteralExpr(args[0].text);
              token = ''; // Attribute injection has no class token
            }
            break;
        }
      }
    }

    if (!token && !attributeNameType) {
      invalid = true;
      continue;
    }

    if (token && typeOnlyImports.has(token)) {
      invalid = true;
      continue;
    }

    deps.push({
      token: token
        ? new o.WrappedNodeExpr(ts.factory.createIdentifier(token))
        : new o.LiteralExpr(null),
      attributeNameType,
      host,
      optional,
      self,
      skipSelf,
    });
  }

  return invalid ? 'invalid' : deps;
}
