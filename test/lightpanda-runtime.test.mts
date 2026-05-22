import http from "node:http";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { createLightpandaManager } from "../src/lightpanda.mts";
import { getFreePort, withOneShotVersionServer, withTimeoutVersionServer } from "./helpers.mts";

const fixture = fileURLToPath(new URL("./fixtures/fake-lightpanda.mjs", import.meta.url));

function options(port: number, mode: string) {
  return {
    args: [fixture],
    command: process.execPath,
    env: {
      FAKE_LIGHTPANDA_HOST: "127.0.0.1",
      FAKE_LIGHTPANDA_MODE: mode,
      FAKE_LIGHTPANDA_PORT: String(port),
    },
    port,
    probeTimeoutMs: 50,
    readyTimeoutMs: 500,
    shutdownTimeoutMs: 50,
    stdio: "ignore" as const,
  };
}

async function withOneShotVersionServerForHost<T>(
  status: number,
  host: string,
  callback: (port: number) => Promise<T>,
): Promise<T> {
  const server = createHttpServer(status, host);
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

function createHttpServer(status: number, host: string) {
  const server = http.createServer((_req, res) => {
    res.writeHead(status, { "content-type": "application/json" });
    res.end("{}");
  });
  server.listen(0, host);
  return server;
}

describe("Lightpanda runtime behavior", () => {
  it("treats an unhealthy version endpoint as not running and spawns", async () => {
    await withOneShotVersionServer(503, async (port) => {
      const controller = await createLightpandaManager(options(port, "ready")).start();

      expect(port).toEqual(expect.any(Number));
      expect(controller.spawned).toBe(true);
      await controller.stop();
    });
  });

  it("falls back to spawning when the probe throws synchronously", async () => {
    const port = await getFreePort();
    const spy = vi.spyOn(http, "get").mockImplementation(() => {
      throw new Error("probe failed");
    });
    try {
      const controller = await createLightpandaManager(options(port, "ready")).start();

      expect(controller.spawned).toBe(true);
      await controller.stop();
    } finally {
      spy.mockRestore();
    }
  });

  it("handles version endpoint probe timeouts gracefully", async () => {
    await withTimeoutVersionServer(async (port) => {
      const controller = await createLightpandaManager({
        ...options(port, "ready"),
        probeTimeoutMs: 10, // short timeout to trigger the timeout handler
      }).start();

      expect(controller.spawned).toBe(true);
      await controller.stop();
    });
  });

  it("registers successful startups with a shutdown registry", async () => {
    const callbacks: Array<() => Promise<void>> = [];
    const port = await getFreePort();
    const controller = await createLightpandaManager({
      ...options(port, "ready"),
      shutdownRegistry: { add: (callback) => callbacks.push(callback) },
    }).start();

    expect(callbacks).toHaveLength(1);
    await callbacks[0]!();
    expect(controller.process?.killed).toBe(true);
  });

  it("falls back to SIGKILL when shutdown is ignored", async () => {
    const port = await getFreePort();
    const controller = await createLightpandaManager(options(port, "ignore-term")).start();

    await controller.stop();
    expect(controller.process?.killed).toBe(true);
  });

  it("logs and notifies when the process exits after startup", async () => {
    const port = await getFreePort();
    const errors: unknown[][] = [];
    const exits: string[] = [];
    const controller = await createLightpandaManager({
      ...options(port, "crash"),
      logger: { error: (...args) => errors.push(args) },
      onUnexpectedExit: (reason) => exits.push(reason),
    }).start();

    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(controller.spawned).toBe(true);
    expect(errors[0]?.[0]).toBe("Lightpanda exited unexpectedly with code 24");
    expect(exits).toEqual(["code 24"]);
    await controller.stop();
  });

  it("uses the default unexpected-exit handler when no callback is supplied", async () => {
    const port = await getFreePort();
    const errors: unknown[][] = [];
    const controller = await createLightpandaManager({
      ...options(port, "crash"),
      logger: { error: (...args) => errors.push(args) },
    }).start();

    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(errors[0]?.[0]).toBe("Lightpanda exited unexpectedly with code 24");
    await controller.stop();
  });

  it("supports custom serve arguments and telemetry opt-in", async () => {
    const port = await getFreePort();
    const controller = await createLightpandaManager({
      ...options(port, "tcp"),
      args: [fixture],
      blockPrivateNetworks: false,
      logLevel: "debug",
      telemetry: true,
    }).start();

    expect(controller.cdpUrl).toBe(`ws://127.0.0.1:${port}`);
    await controller.stop();
  });

  it("normalizes origin checks for canonicalized hosts", async () => {
    await withOneShotVersionServer(200, async (port) => {
      const controller = await createLightpandaManager({
        ...options(port, "ready"),
        host: "LOCALHOST",
      }).start();

      expect(controller.spawned).toBe(false);
      expect(controller.cdpUrl).toBe(`ws://localhost:${port}`);
      await controller.stop();
    });
  });

  it("uses URL-safe IPv6 host formatting for the CDP URL", async () => {
    await withOneShotVersionServerForHost(200, "::1", async (port) => {
      const baseline = options(port, "ready");
      const controller = await createLightpandaManager({
        ...baseline,
        host: "::1",
        env: {
          ...baseline.env,
          FAKE_LIGHTPANDA_HOST: "::1",
        },
      }).start();

      expect(controller.spawned).toBe(false);
      expect(controller.cdpUrl).toBe(`ws://[::1]:${port}`);
      await controller.stop();
    });
  });
});
