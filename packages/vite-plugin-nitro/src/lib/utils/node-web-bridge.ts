import type { IncomingMessage, ServerResponse } from 'node:http';
import { NodeRequest, sendNodeResponse } from 'srvx/node';

export function toWebRequest(
  req: IncomingMessage,
  res?: ServerResponse,
): Request {
  return new NodeRequest({ req, res });
}

export function writeWebResponseToNode(
  res: ServerResponse,
  response: Response,
): Promise<void> {
  return sendNodeResponse(res, response);
}
