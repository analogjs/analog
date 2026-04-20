import { normalizePath, Plugin } from 'vite';
import {
  getAngularComponentMetadata,
  StyleUrlsResolver,
} from './component-resolvers.js';
import { debugHmrV } from './utils/debug.js';
import { TS_EXT_REGEX } from './utils/plugin-config.js';

export interface ActiveGraphComponentRecord {
  file: string;
  className: string;
  selector?: string;
}

export interface StyleOwnerRecord {
  sourcePath: string;
  ownerFile: string;
}

interface TemplateClassBindingIssue {
  line: number;
  column: number;
  snippet: string;
}

export interface TemplateClassBindingGuardContext {
  styleUrlsResolver: StyleUrlsResolver;
  activeGraphComponentMetadata: Map<string, ActiveGraphComponentRecord[]>;
  selectorOwners: Map<string, Set<string>>;
  classNameOwners: Map<string, Set<string>>;
  transformedStyleOwnerMetadata: Map<string, StyleOwnerRecord[]>;
  styleSourceOwners: Map<string, Set<string>>;
}

export function templateClassBindingGuardPlugin(
  ctx: TemplateClassBindingGuardContext,
): Plugin {
  return {
    name: '@analogjs/vite-plugin-angular:template-class-binding-guard',
    enforce: 'pre',
    transform(code: string, id: string) {
      if (id.includes('node_modules')) {
        return;
      }

      const cleanId = id.split('?')[0];

      if (/\.(html|htm)$/i.test(cleanId)) {
        const staticClassIssue = findStaticClassAndBoundClassConflicts(code)[0];
        if (staticClassIssue) {
          throwTemplateClassBindingConflict(cleanId, staticClassIssue);
        }

        const mixedClassIssue = findBoundClassAndNgClassConflicts(code)[0];
        if (mixedClassIssue) {
          this.warn(
            [
              '[Analog Angular] Conflicting class composition.',
              `File: ${cleanId}:${mixedClassIssue.line}:${mixedClassIssue.column}`,
              'This element mixes `[class]` and `[ngClass]`.',
              'Prefer a single class-binding strategy so class merging stays predictable.',
              'Use one `[ngClass]` expression or explicit `[class.foo]` bindings.',
              `Snippet: ${mixedClassIssue.snippet}`,
            ].join('\n'),
          );
        }
        return;
      }

      if (TS_EXT_REGEX.test(cleanId)) {
        const rawStyleUrls = ctx.styleUrlsResolver.resolve(code, cleanId);
        registerStyleOwnerMetadata(ctx, cleanId, rawStyleUrls);
        debugHmrV('component stylesheet owner metadata registered', {
          file: cleanId,
          styleUrlCount: rawStyleUrls.length,
          styleUrls: rawStyleUrls,
          ownerSources: [
            ...(ctx.transformedStyleOwnerMetadata
              .get(cleanId)
              ?.map((record) => record.sourcePath) ?? []),
          ],
        });

        const components = getAngularComponentMetadata(code);

        const inlineTemplateIssue = components.flatMap((component) =>
          component.inlineTemplates.flatMap((template) =>
            findStaticClassAndBoundClassConflicts(template),
          ),
        )[0];

        if (inlineTemplateIssue) {
          throwTemplateClassBindingConflict(cleanId, inlineTemplateIssue);
        }

        const mixedInlineClassIssue = components.flatMap((component) =>
          component.inlineTemplates.flatMap((template) =>
            findBoundClassAndNgClassConflicts(template),
          ),
        )[0];

        if (mixedInlineClassIssue) {
          this.warn(
            [
              '[Analog Angular] Conflicting class composition.',
              `File: ${cleanId}:${mixedInlineClassIssue.line}:${mixedInlineClassIssue.column}`,
              'This element mixes `[class]` and `[ngClass]`.',
              'Prefer a single class-binding strategy so class merging stays predictable.',
              'Use one `[ngClass]` expression or explicit `[class.foo]` bindings.',
              `Snippet: ${mixedInlineClassIssue.snippet}`,
            ].join('\n'),
          );
        }

        const activeGraphRecords = components.map((component) => ({
          file: cleanId,
          className: component.className,
          selector: component.selector,
        }));

        registerActiveGraphMetadata(ctx, cleanId, activeGraphRecords);

        for (const component of components) {
          if (!component.selector && !isLikelyPageOnlyComponent(cleanId)) {
            throw new Error(
              [
                '[Analog Angular] Selectorless component detected.',
                `File: ${cleanId}`,
                `Component: ${component.className}`,
                'This component has no `selector`, so Angular will render it as `ng-component`.',
                'That increases the chance of component ID collisions and makes diagnostics harder to interpret.',
                'Add an explicit selector for reusable components.',
                'Selectorless components are only supported for page and route-only files.',
              ].join('\n'),
            );
          }

          if (component.selector) {
            const selectorEntries = ctx.selectorOwners.get(component.selector);
            if (selectorEntries && selectorEntries.size > 1) {
              throw new Error(
                [
                  '[Analog Angular] Duplicate component selector detected.',
                  `Selector: ${component.selector}`,
                  'Multiple components in the active application graph use the same selector.',
                  'Selectors must be unique within the active graph to avoid ambiguous rendering and confusing diagnostics.',
                  `Locations:\n${formatActiveGraphLocations(selectorEntries)}`,
                ].join('\n'),
              );
            }
          }

          const classNameEntries = ctx.classNameOwners.get(component.className);
          if (classNameEntries && classNameEntries.size > 1) {
            this.warn(
              [
                '[Analog Angular] Duplicate component class name detected.',
                `Class name: ${component.className}`,
                'Two or more Angular components in the active graph share the same exported class name.',
                'Rename one of them to keep HMR, stack traces, and compiler diagnostics unambiguous.',
                `Locations:\n${formatActiveGraphLocations(classNameEntries)}`,
              ].join('\n'),
            );
          }
        }
      }
    },
  };
}

export function removeActiveGraphMetadata(
  ctx: TemplateClassBindingGuardContext,
  file: string,
): void {
  const previous = ctx.activeGraphComponentMetadata.get(file);
  if (!previous) {
    return;
  }

  for (const record of previous) {
    const location = `${record.file}#${record.className}`;
    if (record.selector) {
      const selectorSet = ctx.selectorOwners.get(record.selector);
      selectorSet?.delete(location);
      if (selectorSet?.size === 0) {
        ctx.selectorOwners.delete(record.selector);
      }
    }

    const classNameSet = ctx.classNameOwners.get(record.className);
    classNameSet?.delete(location);
    if (classNameSet?.size === 0) {
      ctx.classNameOwners.delete(record.className);
    }
  }

  ctx.activeGraphComponentMetadata.delete(file);
}

function registerActiveGraphMetadata(
  ctx: TemplateClassBindingGuardContext,
  file: string,
  records: ActiveGraphComponentRecord[],
) {
  removeActiveGraphMetadata(ctx, file);

  if (records.length === 0) {
    return;
  }

  ctx.activeGraphComponentMetadata.set(file, records);

  for (const record of records) {
    const location = `${record.file}#${record.className}`;

    if (record.selector) {
      let selectorSet = ctx.selectorOwners.get(record.selector);
      if (!selectorSet) {
        selectorSet = new Set<string>();
        ctx.selectorOwners.set(record.selector, selectorSet);
      }
      selectorSet.add(location);
    }

    let classNameSet = ctx.classNameOwners.get(record.className);
    if (!classNameSet) {
      classNameSet = new Set<string>();
      ctx.classNameOwners.set(record.className, classNameSet);
    }
    classNameSet.add(location);
  }
}

export function removeStyleOwnerMetadata(
  ctx: TemplateClassBindingGuardContext,
  file: string,
): void {
  const previous = ctx.transformedStyleOwnerMetadata.get(file);
  if (!previous) {
    return;
  }

  for (const record of previous) {
    const owners = ctx.styleSourceOwners.get(record.sourcePath);
    owners?.delete(record.ownerFile);
    if (owners?.size === 0) {
      ctx.styleSourceOwners.delete(record.sourcePath);
    }
  }

  ctx.transformedStyleOwnerMetadata.delete(file);
}

function registerStyleOwnerMetadata(
  ctx: TemplateClassBindingGuardContext,
  file: string,
  styleUrls: string[],
) {
  removeStyleOwnerMetadata(ctx, file);

  const records = styleUrls
    .map((urlSet) => {
      const [, absoluteFileUrl] = urlSet.split('|');
      return absoluteFileUrl
        ? {
            ownerFile: file,
            sourcePath: normalizePath(absoluteFileUrl),
          }
        : undefined;
    })
    .filter((record): record is StyleOwnerRecord => !!record);

  if (records.length === 0) {
    return;
  }

  ctx.transformedStyleOwnerMetadata.set(file, records);

  for (const record of records) {
    let owners = ctx.styleSourceOwners.get(record.sourcePath);
    if (!owners) {
      owners = new Set<string>();
      ctx.styleSourceOwners.set(record.sourcePath, owners);
    }
    owners.add(record.ownerFile);
  }
}

function isLikelyPageOnlyComponent(id: string): boolean {
  return (
    id.includes('/pages/') ||
    /\.page\.[cm]?[jt]sx?$/i.test(id) ||
    /\([^/]+\)\.page\.[cm]?[jt]sx?$/i.test(id)
  );
}

export function findStaticClassAndBoundClassConflicts(
  template: string,
): TemplateClassBindingIssue[] {
  const issues: TemplateClassBindingIssue[] = [];

  for (const { index, snippet } of findOpeningTagSnippets(template)) {
    if (!snippet.includes('[class]')) {
      continue;
    }

    const hasStaticClass = /\sclass\s*=\s*(['"])(?:(?!\1)[\s\S])*\1/.test(
      snippet,
    );
    const hasBoundClass = /\s\[class\]\s*=\s*(['"])(?:(?!\1)[\s\S])*\1/.test(
      snippet,
    );

    if (hasStaticClass && hasBoundClass) {
      const prefix = template.slice(0, index);
      const line = prefix.split('\n').length;
      const lastNewline = prefix.lastIndexOf('\n');
      const column = index - lastNewline;
      issues.push({
        line,
        column,
        snippet: snippet.replace(/\s+/g, ' ').trim(),
      });
    }
  }

  return issues;
}

export function findBoundClassAndNgClassConflicts(
  template: string,
): TemplateClassBindingIssue[] {
  const issues: TemplateClassBindingIssue[] = [];
  const hasWholeElementClassBinding = /\[class\]\s*=/.test(template);

  if (!hasWholeElementClassBinding || !template.includes('[ngClass]')) {
    return issues;
  }

  for (const { index, snippet } of findOpeningTagSnippets(template)) {
    if (!/\[class\]\s*=/.test(snippet) || !snippet.includes('[ngClass]')) {
      continue;
    }

    const prefix = template.slice(0, index);
    const line = prefix.split('\n').length;
    const lastNewline = prefix.lastIndexOf('\n');
    const column = index - lastNewline;
    issues.push({
      line,
      column,
      snippet: snippet.replace(/\s+/g, ' ').trim(),
    });
  }

  return issues;
}

function throwTemplateClassBindingConflict(
  id: string,
  issue: TemplateClassBindingIssue,
): never {
  throw new Error(
    [
      '[Analog Angular] Invalid template class binding.',
      `File: ${id}:${issue.line}:${issue.column}`,
      'The same element uses both a static `class="..."` attribute and a whole-element `[class]="..."` binding.',
      'That pattern can replace or conflict with static Tailwind classes, which makes styles appear to stop applying.',
      'Use `[ngClass]` or explicit `[class.foo]` bindings instead of `[class]` when the element also has static classes.',
      `Snippet: ${issue.snippet}`,
    ].join('\n'),
  );
}

function findOpeningTagSnippets(
  template: string,
): Array<{ index: number; snippet: string }> {
  const matches: Array<{ index: number; snippet: string }> = [];

  for (let index = 0; index < template.length; index++) {
    if (template[index] !== '<') {
      continue;
    }

    const tagStart = template[index + 1];
    if (!tagStart || !/[a-zA-Z]/.test(tagStart)) {
      continue;
    }

    let quote: '"' | "'" | null = null;

    for (let end = index + 1; end < template.length; end++) {
      const char = template[end];

      if (quote) {
        if (char === quote) {
          quote = null;
        }
        continue;
      }

      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }

      if (char === '>') {
        matches.push({
          index,
          snippet: template.slice(index, end + 1),
        });
        index = end;
        break;
      }
    }
  }

  return matches;
}

function formatActiveGraphLocations(entries: Iterable<string>): string {
  return [...entries]
    .sort()
    .map((entry) => `- ${entry}`)
    .join('\n');
}
