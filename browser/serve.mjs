#!/usr/bin/env node
/**
 * (c) 2021-2026 Henri Bergius
 * @file browser/serve.mjs
 * @description Zero-dependency static file server for the no-build browser
 *   fixture (work document #18). Serves the repository root so the import
 *   map can point at the workspace packages' ESM sources directly
 *   (`/packages/...`) with no bundler and no build step.
 *
 * Usage: node browser/serve.mjs [port]
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.argv[2] || process.env.PORT || 8077);

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://localhost:${port}`);
    let pathname = decodeURIComponent(url.pathname);
    if (pathname.endsWith("/")) {
      pathname += "index.html";
    }
    const filePath = normalize(join(root, pathname));
    if (!filePath.startsWith(root + sep) && filePath !== root) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    const body = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(body);
  } catch (error) {
    res.writeHead(error?.code === "ENOENT" ? 404 : 500).end(
      error?.code === "ENOENT" ? "Not found" : String(error),
    );
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`browser fixture: http://127.0.0.1:${port}/browser/index.html`);
});
