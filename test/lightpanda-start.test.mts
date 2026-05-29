import { chmod, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createLightpandaManager,
  resetDefaultControllerForTest,
  startLightpanda,
} from "../src/lightpanda.mts";
import { getFreePort, withVersionServer } from "./helpers.mts";

const fixture = fileURLToPath(new URL("./fixtures/fake-lightpanda.mjs", import.meta.url));
const flakyFixture = fileURLToPath(
  new URL("./fixtures/fake-lightpanda-flaky.mjs", import.meta.url),
);

function flakyStatePath(port: number) {
  return join(tmpdir(), `darkpanda-flaky-${port}.state`);
}

function startupCounterPath(port: number) {
  return join(tmpdir(), `darkpanda-startup-counter-${port}.txt`);
}

async function getStartupCount(path: string) {
  const raw = await readFile(path, "utf8");
  return raw.split(/\r?\n/).filter((line) => line.length > 0).length;
}

function flakyStartOptions(port: number, script: string, state: string) {
  return {
    args: [script],
    command: process.execPath,
    env: {
      DARKPANDA_FAIL_STATE_PATH: state,
      FAKE_LIGHTPANDA_HOST: "127.0.0.1",
      FAKE_LIGHTPANDA_PORT: String(port),
    },
    port,
    probeTimeoutMs: 50,
    readyTimeoutMs: 500,
    shutdownTimeoutMs: 50,
    stdio: "ignore" as const,
  };
}

function managerFor(port: number, mode = "ready", env: Record<string, string> = {}) {
  return createLightpandaManager({
    args: [fixture],
    command: process.execPath,
    env: {
      FAKE_LIGHTPANDA_HOST: "127.0.0.1",
      FAKE_LIGHTPANDA_MODE: mode,
      FAKE_LIGHTPANDA_PORT: String(port),
      ...env,
    },
    port,
    probeTimeoutMs: 50,
    readyTimeoutMs: 500,
    shutdownTimeoutMs: 50,
    stdio: "ignore",
  });
}

describe("Lightpanda startup", () => {
  it("memoizes the default starter when an external browser is available", async () => {
    await withVersionServer(200, async (port) => {
      const first = await startLightpanda({ port });
      const second = await startLightpanda({ port });

      expect(first).toBe(second);
      expect(first.spawned).toBe(false);
    });
  });

  it("returns an external controller when the version endpoint is already healthy", async () => {
    await withVersionServer(200, async (port) => {
      const controller = await createLightpandaManager({ port }).start();

      expect(controller).toMatchObject({
        cdpUrl: `ws://127.0.0.1:${port}`,
        host: "127.0.0.1",
        port,
        process: undefined,
        spawned: false,
      });
      await controller.stop();
    });
  });

  it("spawns a process, memoizes the controller, and stops it", async () => {
    const port = await getFreePort();
    const manager = managerFor(port);

    const first = await manager.start();
    const second = await manager.start();

    expect(first).toBe(second);
    expect(first.spawned).toBe(true);
    expect(first.process?.pid).toEqual(expect.any(Number));
    await first.stop();
    expect(first.process?.killed).toBe(true);
  });

  it("uses generated serve arguments and disables telemetry by default", async () => {
    const port = await getFreePort();
    const capturePath = join(tmpdir(), `darkpanda-${port}.json`);
    await chmod(fixture, 0o755);
    const controller = await createLightpandaManager({
      command: fixture,
      env: {
        FAKE_LIGHTPANDA_CAPTURE: capturePath,
      },
      port,
      probeTimeoutMs: 50,
      readyTimeoutMs: 500,
      shutdownTimeoutMs: 50,
      stdio: "ignore",
    }).start();
    const capture = JSON.parse(await readFile(capturePath, "utf8"));

    expect(capture).toEqual({
      argv: [
        "serve",
        "--host",
        "127.0.0.1",
        "--port",
        String(port),
        "--log-level",
        "error",
        "--block-private-networks",
      ],
      telemetry: "true",
    });
    await controller.stop();
  });

  it("generates serve arguments from custom defaults", async () => {
    const port = await getFreePort();
    const capturePath = join(tmpdir(), `darkpanda-custom-${port}.json`);
    await chmod(fixture, 0o755);
    const controller = await createLightpandaManager({
      blockPrivateNetworks: false,
      command: fixture,
      env: {
        FAKE_LIGHTPANDA_CAPTURE: capturePath,
      },
      host: "127.0.0.1",
      logLevel: "debug",
      port,
      probeTimeoutMs: 50,
      readyTimeoutMs: 500,
      shutdownTimeoutMs: 50,
      spawnOptions: { windowsHide: true },
      stdio: "ignore",
      telemetry: true,
      versionPath: "/custom-version",
    }).start();
    const capture = JSON.parse(await readFile(capturePath, "utf8"));

    expect(capture).toEqual({
      argv: ["serve", "--host", "127.0.0.1", "--port", String(port), "--log-level", "debug"],
      telemetry: "false",
    });
    await controller.stop();
  });

  it("uses the default CDP port when no port is supplied", async () => {
    const capturePath = join(tmpdir(), "darkpanda-default-port.json");
    await chmod(fixture, 0o755);
    const controller = await createLightpandaManager({
      command: fixture,
      env: {
        FAKE_LIGHTPANDA_CAPTURE: capturePath,
      },
      probeTimeoutMs: 50,
      readyTimeoutMs: 500,
      shutdownTimeoutMs: 50,
      stdio: "ignore",
    }).start();
    const capture = JSON.parse(await readFile(capturePath, "utf8"));

    expect(capture.argv).toContain("9222");
    await controller.stop();
  });

  it("rejects with a helpful error when the executable is missing", async () => {
    const port = await getFreePort();
    const manager = createLightpandaManager({
      command: "definitely-not-lightpanda",
      port,
      readyTimeoutMs: 500,
    });

    await expect(manager.start()).rejects.toThrow("lightpanda binary not found");
  });

  it("preserves non-ENOENT spawn errors", async () => {
    const port = await getFreePort();
    const badExecutable = join(tmpdir(), `darkpanda-not-executable-${port}`);
    await writeFile(badExecutable, "#!/bin/sh\n");

    await expect(
      createLightpandaManager({
        command: badExecutable,
        port,
        readyTimeoutMs: 500,
      }).start(),
    ).rejects.toThrow("EACCES");
  });

  it("rejects when the process exits before the port is ready", async () => {
    const port = await getFreePort();

    await expect(managerFor(port, "exit").start()).rejects.toThrow(
      `Lightpanda exited with code 23 before port 127.0.0.1:${port} was ready`,
    );
  });

  it("reports signal exits before the port is ready", async () => {
    const port = await getFreePort();

    await expect(managerFor(port, "signal-exit").start()).rejects.toThrow(
      `Lightpanda exited with signal SIGTERM before port 127.0.0.1:${port} was ready`,
    );
  });

  it("rejects when the port never opens", async () => {
    const port = await getFreePort();

    await expect(managerFor(port, "hang").start()).rejects.toThrow(
      `Lightpanda not ready after 500ms on 127.0.0.1:${port}`,
    );
  });

  it("shares a startup when manager starts are concurrent", async () => {
    const port = await getFreePort();
    const startupCounter = startupCounterPath(port);
    const manager = managerFor(port, "ready", {
      LIGHTPANDA_STARTUP_COUNTER_PATH: startupCounter,
      LIGHTPANDA_STARTUP_DELAY_MS: "75",
    });

    const [first, second] = await Promise.all([manager.start(), manager.start()]);

    expect(first).toBe(second);
    expect(await getStartupCount(startupCounter)).toBe(1);
    expect(first.spawned).toBe(true);
    await first.stop();
  });

  it("shares a startup when startLightpanda calls are concurrent", async () => {
    resetDefaultControllerForTest();
    const port = await getFreePort();
    const startupCounter = startupCounterPath(port);
    const options = {
      args: [fixture],
      command: process.execPath,
      env: {
        FAKE_LIGHTPANDA_HOST: "127.0.0.1",
        FAKE_LIGHTPANDA_MODE: "ready",
        FAKE_LIGHTPANDA_PORT: String(port),
        LIGHTPANDA_STARTUP_COUNTER_PATH: startupCounter,
        LIGHTPANDA_STARTUP_DELAY_MS: "75",
      },
      port,
      probeTimeoutMs: 50,
      readyTimeoutMs: 500,
      shutdownTimeoutMs: 50,
      stdio: "ignore" as const,
    };
    const [first, second] = await Promise.all([startLightpanda(options), startLightpanda(options)]);

    expect(first).toBe(second);
    expect(await getStartupCount(startupCounter)).toBe(1);
    expect(first.spawned).toBe(true);
    await first.stop();
  });

  it("clears the cache on start failure to allow subsequent retries", async () => {
    const port = await getFreePort();
    const state = flakyStatePath(port);
    await writeFile(state, "0", "utf8");
    const manager = createLightpandaManager({
      ...flakyStartOptions(port, flakyFixture, state),
    });

    await expect(manager.start()).rejects.toThrow(
      `Lightpanda exited with code 23 before port 127.0.0.1:${port} was ready`,
    );
    const controller = await manager.start();
    expect(controller.spawned).toBe(true);
    await controller.stop();
  });

  it("clears the cache on start failure to allow subsequent retries (global)", async () => {
    resetDefaultControllerForTest();
    const port = await getFreePort();
    const state = flakyStatePath(port);
    await writeFile(state, "0", "utf8");
    const options = flakyStartOptions(port, flakyFixture, state);

    await expect(startLightpanda(options)).rejects.toThrow(
      `Lightpanda exited with code 23 before port 127.0.0.1:${port} was ready`,
    );
    const controller = await startLightpanda(options);
    expect(controller.spawned).toBe(true);
    await controller.stop();
  });
});
