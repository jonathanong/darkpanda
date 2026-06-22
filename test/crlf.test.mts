import { normalizeOptions } from "../src/options.mts";

describe("Security: HTTP Request Splitting prevention", () => {
  it("rejects versionPath containing CRLF characters", () => {
    expect(() => normalizeOptions({ versionPath: "/json/version\r\n" })).toThrow(/CRLF/);
  });
});
