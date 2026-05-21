import { describe, it, expect } from "vitest";
import { createLightpandaManager, startLightpanda } from "../src/lightpanda.mts";
import { getFreePort, withVersionServer } from "./helpers.mts";
import { fileURLToPath } from "node:url";

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

describe("Concurrent startups", () => {
  it("memoizes concurrent calls to startLightpanda", async () => {
    await withVersionServer(200, async (port) => {
      const [first, second] = await Promise.all([
        startLightpanda({ port }),
        startLightpanda({ port }),
      ]);

      expect(first).toBe(second);
      expect(first.spawned).toBe(false);
    });
  });

  it("memoizes concurrent calls to manager.start()", async () => {
    const port = await getFreePort();
    const manager = managerFor(port);

    const [first, second] = await Promise.all([manager.start(), manager.start()]);

    expect(first).toBe(second);
    expect(first.spawned).toBe(true);
    await first.stop();
  });
});
