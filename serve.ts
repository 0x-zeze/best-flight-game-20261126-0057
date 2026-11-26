import { createReadStream, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
};

function parsePort(argv: string[]): number {
  const flag = argv.indexOf('--port');
  const raw = flag >= 0 ? Number(argv[flag + 1]) : Number(process.env.PORT ?? 8080);
  return Number.isInteger(raw) && raw > 0 && raw < 65536 ? raw : 8080;
}

const gameRoot = resolve(dirname(fileURLToPath(import.meta.url)), 'game');
const port = parsePort(process.argv.slice(2));

function handleRequest(req: IncomingMessage, res: ServerResponse): void {
  const reqUrl = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
  let relPath: string;
  try {
    relPath = decodeURIComponent(reqUrl.pathname);
  } catch {
    res.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' }).end('Bad Request');
    return;
  }

  if (relPath === '/' || relPath.endsWith('/')) {
    relPath += 'index.html';
  }

  const target = resolve(gameRoot, '.' + relPath);
  if (target !== gameRoot && !target.startsWith(gameRoot + sep)) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' }).end('Forbidden');
    return;
  }

  let fileSize = 0;
  try {
    const info = statSync(target);
    if (!info.isFile()) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not Found');
      return;
    }
    fileSize = info.size;
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not Found');
    return;
  }

  const mime = CONTENT_TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream';
  res.writeHead(200, {
    'content-type': mime,
    'content-length': fileSize,
    'cache-control': 'no-cache',
  });
  createReadStream(target).pipe(res);
}

const server = createServer(handleRequest);
server.listen(port, '127.0.0.1', () => {
  console.log(`Ridge Runner serving ${gameRoot} at http://127.0.0.1:${port}`);
});
