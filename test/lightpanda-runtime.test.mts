import http from "node:http";
import { fileURLToPath } from "node:url";
import { createLightpandaManager } from "../src/lightpanda.mts";
import { getFreePort, withOneShotVersionServer } from "./helpers.mts";

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
});
