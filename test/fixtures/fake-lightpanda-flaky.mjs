#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";

const statePath = process.env.DARKPANDA_FAIL_STATE_PATH;
const host = process.env.FAKE_LIGHTPANDA_HOST ?? "127.0.0.1";
const port = Number(process.env.FAKE_LIGHTPANDA_PORT);

if (statePath !== undefined) {
  const attempts = Number.parseInt(fs.readFileSync(statePath, "utf8"), 10);
  const nextAttempt = Number.isNaN(attempts) ? 1 : attempts + 1;
  fs.writeFileSync(statePath, String(nextAttempt), "utf8");
  if (nextAttempt === 1) process.exit(23);
}

const server = http.createServer((_, res) => {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ Browser: "FakeLightpanda/1.0" }));
});

server.listen(port, host, () => {});
process.on("SIGTERM", () => server.close(() => process.exit(0)));
