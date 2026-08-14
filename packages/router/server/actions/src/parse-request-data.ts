import { readBody, readFormData, toRequest as h3ToRequest } from 'nitro/h3';

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

function getRequest(event: { method: string; headers: Headers }): Request {
  const maybeRequest = (event as unknown as { request?: Request }).request;
  if (maybeRequest) {
    return maybeRequest;
  }
  return h3ToRequest(event as Parameters<typeof h3ToRequest>[0]);
}

function getContentType(event: { method: string; headers: Headers }): string {
  const request = getRequest(event);

  return (
    request.headers.get('content-type') ??
    event.headers.get('content-type') ??
    event.headers.get('Content-Type') ??
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
  const result: Record<string, ParsedRequestValue> = {};
  searchParams.forEach((value, key) => {
    appendEntry(result, key, value);
  });
  return result;
}

export function parseFormData(
  formData: FormData,
): Record<string, ParsedRequestValue> {
  const result: Record<string, ParsedRequestValue> = {};
  formData.forEach((value, key) => {
    appendEntry(result, key, value as RequestEntryValue);
  });
  return result;
}

export async function parseRequestData(event: {
  method: string;
  headers: Headers;
}): Promise<unknown> {
  const request = getRequest(event);
  const httpEvent = event as unknown as Parameters<typeof readBody>[0];
  const h3Event = event as unknown as Parameters<typeof readFormData>[0];
  const method = event.method.toUpperCase();

  if (method === 'GET' || method === 'HEAD') {
    const url = new URL(request.url, 'http://localhost');
    return parseSearchParams(url.searchParams);
  }

  const contentType = getContentType(event);

  if (isJsonContentType(contentType)) {
    try {
      return (await readBody(httpEvent)) ?? {};
    } catch {
      try {
        return await request.json();
      } catch {
        return {};
      }
    }
  }

  if (isFormContentType(contentType)) {
    try {
      return parseFormData(await readFormData(h3Event));
    } catch {
      if (typeof request.formData === 'function') {
        return parseFormData(await request.formData());
      }

      return {};
    }
  }

  try {
    return (await readBody(httpEvent)) ?? {};
  } catch {
    try {
      return await request.json();
    } catch {
      return {};
    }
  }
}
