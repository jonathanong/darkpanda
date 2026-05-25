import { createLightpandaManager } from "../src/lightpanda.mts";

describe("Security: Synchronous exceptions in retry loops", () => {
  it("catches synchronous exceptions in net.connect (e.g. invalid port)", async () => {
    const port = -1;
    const manager = createLightpandaManager({
      command: "sleep",
      args: ["1"],
      port,
      readyTimeoutMs: 50,
      probeTimeoutMs: 50,
      shutdownTimeoutMs: 50,
    });

    await expect(manager.start()).rejects.toThrow("Port should be >= 0 and < 65536");
  });
});
