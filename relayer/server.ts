/**
 * Vereed relayer HTTP layer.
 *
 * Exposes the existing settleFromSourceTx service. POST /settle broadcasts a Creditcoin
 * execute transaction using the server-side CREDITCOIN_WALLET_PRIVATE_KEY. The signing key
 * never leaves this process.
 */
import { createServer, IncomingMessage, ServerResponse } from 'http';
import {
  asRelayerError,
  getSettlementStatus,
  RelayerError,
  requireValidSourceTxHash,
  settleFromSourceTx,
} from './settle';

const DEFAULT_PORT = 3000;
const MAX_BODY_BYTES = 16_384;

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function sendError(res: ServerResponse, error: unknown): void {
  const relayerError = asRelayerError(error);
  sendJson(res, relayerError.httpStatus, {
    success: false,
    error: relayerError.code,
    message: relayerError.message,
  });
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new RelayerError('INVALID_REQUEST', 'Request body is too large', 400));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on('end', () => {
      if (chunks.length === 0) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new RelayerError('INVALID_REQUEST', 'Request body must be JSON', 400));
      }
    });

    req.on('error', (error) => reject(error));
  });
}

function requestUrl(req: IncomingMessage): URL {
  return new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
}

async function handleSettlePost(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const body = await readJsonBody(req);
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new RelayerError('INVALID_REQUEST', 'Request body must be a JSON object', 400);
  }

  const sourceTxHash = requireValidSourceTxHash((body as { sourceTxHash?: unknown }).sourceTxHash);
  const result = await settleFromSourceTx(sourceTxHash);
  sendJson(res, 200, result);
}

async function handleSettleGet(sourceTxHash: string, res: ServerResponse): Promise<void> {
  const status = await getSettlementStatus(sourceTxHash);
  sendJson(res, 200, status);
}

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = requestUrl(req);
  const method = req.method ?? 'GET';
  const path = url.pathname.replace(/\/+$/, '') || '/';

  if (method === 'GET' && path === '/health') {
    sendJson(res, 200, { ok: true });
    return;
  }

  if (method === 'POST' && path === '/settle') {
    await handleSettlePost(req, res);
    return;
  }

  const settleMatch = path.match(/^\/settle\/(0x[0-9a-fA-F]{64})$/);
  if (method === 'GET' && settleMatch) {
    await handleSettleGet(settleMatch[1], res);
    return;
  }

  if (method === 'GET' && path.startsWith('/settle/')) {
    throw new RelayerError(
      'INVALID_SOURCE_TX_HASH',
      'sourceTxHash must be a 0x-prefixed 32-byte transaction hash',
      400,
    );
  }

  if (path === '/settle') {
    throw new RelayerError('INVALID_REQUEST', 'Use POST /settle with a JSON body, or GET /settle/:sourceTxHash', 405);
  }

  sendJson(res, 404, { success: false, error: 'NOT_FOUND', message: 'Not found' });
}

const parsedPort = Number.parseInt(process.env.PORT ?? String(DEFAULT_PORT), 10);
const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : DEFAULT_PORT;

const server = createServer((req, res) => {
  handleRequest(req, res).catch((error: unknown) => {
    if (!res.headersSent) {
      sendError(res, error);
      return;
    }
    res.end();
  });
});

server.listen(port, () => {
  console.log(`Vereed relayer listening on port ${port}`);
});
