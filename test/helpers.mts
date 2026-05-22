import http from "node:http";
import net from "node:net";
import { once } from "node:events";

export async function getFreePort(): Promise<number> {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (address === null || typeof address === "string") {
    throw new Error("expected tcp address");
  }
  return address.port;
}

export async function withVersionServer<T>(
  status: number,
  callback: (port: number) => Promise<T>,
): Promise<T> {
  const server = http.createServer((_req, res) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end("{}");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected tcp address");
  }
  try {
    return await callback(address.port);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

export async function withOneShotVersionServer<T>(
  status: number,
  callback: (port: number) => Promise<T>,
): Promise<T> {
  const server = http.createServer((_req, res) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end("{}");
    server.close();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected tcp address");
  }
  try {
    return await callback(address.port);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

export async function withTimeoutVersionServer<T>(
  callback: (port: number) => Promise<T>,
): Promise<T> {
  const server = http.createServer((_req, _res) => {
    // intentionally don't respond to simulate a timeout
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("expected tcp address");
  }
  return await callback(address.port);
}
