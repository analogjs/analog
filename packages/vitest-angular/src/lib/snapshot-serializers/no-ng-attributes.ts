import { type SnapshotSerializer } from 'vitest';

const CLEANED_ELEMENT_MARKER = '__analogSnapshotCleaned__';

export const attributesToRemovePatterns = [
  'ng-reflect',
  '_nghost',
  '_ngcontent',
  'ng-version',
];

export const attributesToClean: Record<string, RegExp[]> = {
  class: [/^(?:mat|cdk|ng).*-\w*\d+-\d+$/, /^ng-star-inserted$/],
  id: [/^(?:mat|cdk|ng).*-\d+$/],
  for: [/^(?:mat|cdk|ng).*-\d+$/],
  'aria-owns': [/^(?:mat|cdk|ng).*-\d+$/],
  'aria-labelledby': [/^(?:mat|cdk|ng).*-\d+$/],
  'aria-controls': [/^(?:mat|cdk|ng).*-\d+$/],
};

const hasAttributesToRemove = (attribute: Attr): boolean =>
  attributesToRemovePatterns.some((removePattern) =>
    attribute.name.startsWith(removePattern),
  );

const hasAttributesToClean = (attribute: Attr): boolean =>
  Object.prototype.hasOwnProperty.call(attributesToClean, attribute.name);

const attributeNeedsCleaning = (attribute: Attr): boolean =>
  hasAttributesToClean(attribute) &&
  attribute.value
    .split(' ')
    .some((attrValue) =>
      attributesToClean[attribute.name].some((attributeCleanRegex) =>
        attributeCleanRegex.test(attrValue),
      ),
    );

const shouldSerializeElement = (node: Element): boolean => {
  if (node.parentElement?.tagName === 'BODY' && node.hasAttribute('id')) {
    return true;
  }

  return Array.from(node.attributes).some(
    (attribute) =>
      hasAttributesToRemove(attribute) || attributeNeedsCleaning(attribute),
  );
};

function cleanAngularElementAttributes(node: Element): Element {
  const nodeCopy = node.cloneNode(true) as Element;

  Object.defineProperty(nodeCopy, CLEANED_ELEMENT_MARKER, {
    configurable: true,
    value: true,
  });

  if (node.parentElement?.tagName === 'BODY') {
    nodeCopy.removeAttribute('id');
  }

  Array.from(nodeCopy.attributes).forEach((attribute) => {
    if (hasAttributesToRemove(attribute)) {
      nodeCopy.removeAttribute(attribute.name);
      return;
    }

    if (hasAttributesToClean(attribute)) {
      const cleanedValue = attribute.value
        .split(' ')
        .filter(
          (attrValue) =>
            !attributesToClean[attribute.name].some((attributeCleanRegex) =>
              attributeCleanRegex.test(attrValue),
            ),
        )
        .join(' ');

      if (cleanedValue === '') {
        nodeCopy.removeAttribute(attribute.name);
        return;
      }

      nodeCopy.setAttribute(attribute.name, cleanedValue);
    }
  });

  return nodeCopy;
}

export function createNoNgAttributesSnapshotSerializer(): SnapshotSerializer {
  return {
    serialize(val, config, indentation, depth, refs, printer): string {
      const cleanedNode = cleanAngularElementAttributes(val);

      if (shouldSerializeElement(cleanedNode)) {
        throw new Error(
          `NoNgAttributes serializer did not stabilize for <${cleanedNode.tagName.toLowerCase()}>`,
        );
      }

      return printer(cleanedNode, config, indentation, depth, refs);
    },
    test(val): boolean {
      const matches =
        typeof Element !== 'undefined' &&
        val instanceof Element &&
        !(val as Element & Record<string, unknown>)[CLEANED_ELEMENT_MARKER] &&
        shouldSerializeElement(val);

      return matches;
    },
  };
}
