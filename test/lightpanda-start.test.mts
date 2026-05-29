import { chmod, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLightpandaManager, startLightpanda } from "../src/lightpanda.mts";
import { getFreePort, withVersionServer } from "./helpers.mts";

const fixture = fileURLToPath(new URL("./fixtures/fake-lightpanda.mjs", import.meta.url));

function managerFor(port: number, mode = "ready") {
  return createLightpandaManager({
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

  it("rejects when the port connection hangs (timeout)", async () => {
    const port = await getFreePort();

    // To trigger the socket timeout handler without waiting for the actual deadline,
    // we mock net.connect.
    const net = await import("node:net");
    let timeoutConfigured = false;
    let destroyArgument: unknown;
    let mockedSocket: unknown = null;
    const spy = vi.spyOn(net.default, "connect").mockImplementation(() => {
      const socket = new net.default.Socket();
      let timeout: ReturnType<typeof setTimeout>;
      vi.spyOn(socket, "setTimeout").mockImplementation((ms: number) => {
        timeoutConfigured = ms > 0;
        if (ms > 0) {
          timeout = setTimeout(() => {
            socket.emit("timeout");
          }, 10);
        }
        return socket;
      });
      vi.spyOn(socket, "destroy").mockImplementation((error?: Error) => {
        destroyArgument = error;
        clearTimeout(timeout);
        if (error !== undefined) {
          socket.emit("error", error);
        }
        return socket;
      });
      socket.on("error", () => {});
      mockedSocket = socket;
      return socket as any;
    });

    try {
      await expect(managerFor(port, "hang").start()).rejects.toThrow(
        `Lightpanda not ready after 500ms on 127.0.0.1:${port}`,
      );
      expect(timeoutConfigured).toBe(true);
      expect(
        (mockedSocket as { setTimeout: ReturnType<typeof vi.fn> }).setTimeout,
      ).toHaveBeenCalled();
      expect(destroyArgument).toBeInstanceOf(Error);
    } finally {
      spy.mockRestore();
    }
  });

  it("rejects when the port never opens", async () => {
    const port = await getFreePort();

    await expect(managerFor(port, "hang").start()).rejects.toThrow(
      `Lightpanda not ready after 500ms on 127.0.0.1:${port}`,
    );
  });

  it("throws an error when versionPath is invalid", async () => {
    const assertStartError = async (versionPath: unknown, message: string): Promise<void> => {
      let error: unknown;

      try {
        await createLightpandaManager({
          versionPath: versionPath as unknown as string,
        }).start();
        error = new Error("Expected start() to throw");
      } catch (err) {
        error = err;
      }

      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe(message);
    };

    await assertStartError("evil.com", "versionPath must start with a single slash");
    await assertStartError(
      "//evil.com",
      "versionPath must start with a single '/' and cannot start with '//'",
    );
    await assertStartError("@evil.com", "versionPath must start with a single slash");
    await assertStartError(123, "versionPath must be a string");
  });
});
