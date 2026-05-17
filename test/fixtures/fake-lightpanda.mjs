#!/usr/bin/env node
import http from "node:http";
import fs from "node:fs";
import net from "node:net";

const mode = process.env.FAKE_LIGHTPANDA_MODE ?? "ready";
const host = process.env.FAKE_LIGHTPANDA_HOST ?? "127.0.0.1";
const portFlagIndex = process.argv.indexOf("--port");
const port = Number(process.env.FAKE_LIGHTPANDA_PORT ?? process.argv[portFlagIndex + 1]);
const capturePath = process.env.FAKE_LIGHTPANDA_CAPTURE;

if (capturePath !== undefined) {
  fs.writeFileSync(
    capturePath,
    JSON.stringify({
      argv: process.argv.slice(2),
      telemetry: process.env.LIGHTPANDA_DISABLE_TELEMETRY,
    }),
  );
}

if (mode === "exit") process.exit(23);
if (mode === "signal-exit") process.kill(process.pid, "SIGTERM");
if (mode === "hang") {
  setInterval(() => {}, 1000);
} else {
  const handler = (_req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ Browser: "FakeLightpanda/1.0" }));
  };

  const server =
    mode === "tcp" ? net.createServer((socket) => socket.end()) : http.createServer(handler);

  server.listen(port, host, () => {
    if (mode === "crash") setTimeout(() => process.exit(24), 100);
  });

  process.on("SIGTERM", () => {
    if (mode === "ignore-term") return;
    server.close(() => process.exit(0));
  });
}
