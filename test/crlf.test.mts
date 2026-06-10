import { normalizeOptions } from "../src/options.mts";
import { expect, test } from "vitest";

test("throws on CRLF characters in versionPath", () => {
  expect(() => normalizeOptions({ versionPath: "/a\r\nb" })).toThrow(
    "versionPath cannot contain CRLF characters",
  );
  expect(() => normalizeOptions({ versionPath: "/a\nb" })).toThrow(
    "versionPath cannot contain CRLF characters",
  );
});
