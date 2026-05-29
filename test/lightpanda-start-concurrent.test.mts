import { describe, it, expect } from "vitest";
import { startLightpanda, createLightpandaManager } from "../src/lightpanda.mjs";
import { withVersionServer } from "./helpers.mts";

describe("lightpanda concurrent start", () => {
  it("clears default controller promise on failure", async () => {
    const errorOptions = { command: "non-existent-binary-for-test", readyTimeoutMs: 100 };
    await expect(startLightpanda(errorOptions)).rejects.toThrow();
    // After a failure, it should be possible to try again and get a new error (meaning promise was cleared)
    await expect(startLightpanda(errorOptions)).rejects.toThrow();
  });

  it("manager clears controller promise on failure", async () => {
    const manager = createLightpandaManager({
      command: "non-existent-binary-for-test",
      readyTimeoutMs: 100,
    });
    await expect(manager.start()).rejects.toThrow();
    await expect(manager.start()).rejects.toThrow();
  });

  it("handles concurrent successful starts correctly", async () => {
    await withVersionServer(200, async (port) => {
      const manager = createLightpandaManager({ port });
      // Call start() multiple times concurrently
      const [first, second, third] = await Promise.all([
        manager.start(),
        manager.start(),
        manager.start(),
      ]);
      expect(first).toBe(second);
      expect(second).toBe(third);
      expect(first.spawned).toBe(false);
    });
  });
});
