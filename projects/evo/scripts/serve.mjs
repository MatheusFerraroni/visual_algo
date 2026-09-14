import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const HOST = "127.0.0.1";
const PORT = 8000;
const PROJECT_ROOT = resolve(fileURLToPath(new URL("../", import.meta.url)));

const CONTENT_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".map", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
]);

function isInsideRoot(root, candidate) {
  const pathFromRoot = relative(root, candidate);
  return pathFromRoot === "" || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== ".." && !isAbsolute(pathFromRoot));
}

export function resolveRequestPath(root, requestPath) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(requestPath);
  } catch {
    return null;
  }

  if (decodedPath.includes("\0")) {
    return null;
  }

  const segments = decodedPath.split("/").filter(Boolean);
  if (segments.some((segment) => segment.startsWith("."))) {
    return null;
  }

  const relativePath = decodedPath.endsWith("/")
    ? `${decodedPath}index.html`
    : decodedPath;
  const candidate = resolve(root, relativePath.replace(/^\/+/, ""));

  return isInsideRoot(root, candidate) ? candidate : null;
}

export function createStaticServer({ root = PROJECT_ROOT } = {}) {
  const resolvedRoot = resolve(root);

  return createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, {
        Allow: "GET, HEAD",
        "Content-Type": "text/plain; charset=utf-8",
      });
      response.end("Método não permitido.\n");
      return;
    }

    let pathname;
    try {
      pathname = new URL(request.url ?? "/", "http://localhost").pathname;
    } catch {
      response.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Requisição inválida.\n");
      return;
    }

    const requestedFile = resolveRequestPath(resolvedRoot, pathname);
    if (!requestedFile) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Acesso negado.\n");
      return;
    }

    let fileStats;
    try {
      fileStats = await stat(requestedFile);
    } catch {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Arquivo não encontrado.\n");
      return;
    }

    if (!fileStats.isFile()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Arquivo não encontrado.\n");
      return;
    }

    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Length": fileStats.size,
      "Content-Type": CONTENT_TYPES.get(extname(requestedFile).toLowerCase()) ?? "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    });

    if (request.method === "HEAD") {
      response.end();
      return;
    }

    createReadStream(requestedFile).pipe(response);
  });
}

export function startServer({ host = HOST, port = PORT, root = PROJECT_ROOT } = {}) {
  const server = createStaticServer({ root });

  server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
      console.error(`A porta ${port} já está em uso. Encerre o outro processo e tente novamente.`);
    } else {
      console.error("Não foi possível iniciar o servidor:", error.message);
    }
    process.exitCode = 1;
  });

  server.listen(port, host, () => {
    console.log(`Evo disponível em http://${host}:${port}`);
  });

  const stop = () => server.close(() => process.exit());
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  return server;
}

const isDirectExecution = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  startServer();
}
