import net from "node:net";
import { fileURLToPath } from "node:url";
import { createLightpandaManager } from "../src/lightpanda.mts";
import { normalizeOptions } from "../src/options.mts";
import { getFreePort } from "./helpers.mts";

const fixture = fileURLToPath(new URL("./fixtures/fake-lightpanda.mjs", import.meta.url));

describe("Security: Synchronous exceptions in retry loops", () => {
  it("rejects when net.connect throws synchronously during a retry", async () => {
    const port = await getFreePort();
    const originalConnect = net.connect;
    const connectSpy = vi.spyOn(net, "connect");
    const syncError = new Error("sync connect failure");

    connectSpy.mockImplementation((...args: Parameters<typeof net.connect>) => {
      if (connectSpy.mock.calls.length === 2) {
        throw syncError;
      }
      return originalConnect(...args);
    });

    const manager = createLightpandaManager({
      args: [fixture],
      command: process.execPath,
      env: {
        FAKE_LIGHTPANDA_MODE: "hang",
        FAKE_LIGHTPANDA_PORT: String(port),
        FAKE_LIGHTPANDA_HOST: "127.0.0.1",
      },
      port,
      readyTimeoutMs: 200,
      probeTimeoutMs: 50,
      shutdownTimeoutMs: 50,
    });

    try {
      await expect(manager.start()).rejects.toThrow("sync connect failure");
      expect(connectSpy).toHaveBeenCalledTimes(2);
    } finally {
      connectSpy.mockRestore();
    }
  });
});

describe("Security: HTTP Request Splitting", () => {
  it("rejects versionPath containing CRLF characters", () => {
    expect(() => {
      normalizeOptions({
        versionPath: "/json/version\r\nHost: attacker.com",
      });
    }).toThrow("versionPath cannot contain carriage return or line feed characters");

    expect(() => {
      normalizeOptions({
        versionPath: "/json/version\nGET / HTTP/1.1",
      });
    }).toThrow("versionPath cannot contain carriage return or line feed characters");

    expect(() => {
      normalizeOptions({
        versionPath: "/json/version\rX-Injected-Header: value",
      });
    }).toThrow("versionPath cannot contain carriage return or line feed characters");
  });
});
