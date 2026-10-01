import type { H3Event } from 'h3';
import { getRequestURL, readBody, readFormData, toWebRequest } from 'h3';

type RequestEntryValue = string | File;
type ParsedRequestValue = RequestEntryValue | RequestEntryValue[];

function appendEntry(
  target: Record<string, ParsedRequestValue>,
  key: string,
  value: RequestEntryValue,
) {
  const existingValue = target[key];

  if (existingValue === undefined) {
    target[key] = value;
    return;
  }

  if (Array.isArray(existingValue)) {
    existingValue.push(value);
    return;
  }

  target[key] = [existingValue, value];
}

function getRequest(event: H3Event): Request {
  return event.web?.request ?? toWebRequest(event);
}

export function getRequestUrl(event: H3Event): string {
  return event.web?.request?.url ?? getRequestURL(event).href;
}

function getContentType(event: H3Event): string {
  return (
    event.web?.request?.headers.get('content-type') ??
    event.headers.get('content-type') ??
    ''
  );
}

function isJsonContentType(contentType: string): boolean {
  const mimeType = contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
  return mimeType === 'application/json' || mimeType.endsWith('+json');
}

function isFormContentType(contentType: string): boolean {
  return (
    contentType.includes('multipart/form-data') ||
    contentType.includes('application/x-www-form-urlencoded')
  );
}

export function parseSearchParams(
  searchParams: URLSearchParams,
): Record<string, ParsedRequestValue> {
  const result: Record<string, ParsedRequestValue> = Object.create(null);
  searchParams.forEach((value, key) => {
    appendEntry(result, key, value);
  });
  return result;
}

export function parseFormData(
  formData: FormData,
): Record<string, ParsedRequestValue> {
  const result: Record<string, ParsedRequestValue> = Object.create(null);
  formData.forEach((value, key) => {
    appendEntry(result, key, value as RequestEntryValue);
  });
  return result;
}

export async function parseRequestData(event: H3Event): Promise<unknown> {
  const method = event.method.toUpperCase();

  if (method === 'GET' || method === 'HEAD') {
    const url = new URL(getRequestUrl(event), 'http://localhost');
    return parseSearchParams(url.searchParams);
  }

  const contentType = getContentType(event);

  if (isJsonContentType(contentType)) {
    try {
      return (await readBody(event)) ?? {};
    } catch {
      try {
        return await getRequest(event).json();
      } catch {
        return {};
      }
    }
  }

  if (isFormContentType(contentType)) {
    try {
      return parseFormData(await readFormData(event));
    } catch {
      const request = getRequest(event);
      if (typeof request.formData === 'function') {
        try {
          return parseFormData(await request.formData());
        } catch {
          return {};
        }
      }

      return {};
    }
  }

  try {
    return (await readBody(event)) ?? {};
  } catch {
    try {
      return await getRequest(event).json();
    } catch {
      return {};
    }
  }
}
