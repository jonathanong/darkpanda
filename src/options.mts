import type { LightpandaOptions, NormalizedOptions } from "./types.mjs";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 9222;
const DEFAULT_READY_TIMEOUT_MS = 15_000;
const DEFAULT_PROBE_TIMEOUT_MS = 2_000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 5_000;

export function normalizeOptions(options: LightpandaOptions = {}): NormalizedOptions {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  const logLevel = options.logLevel ?? "error";
  const block = options.blockPrivateNetworks ?? true;
  const args = options.args ?? [
    "serve",
    "--host",
    host,
    "--port",
    String(port),
    "--log-level",
    logLevel,
    ...(block ? ["--block-private-networks"] : []),
  ];
  const env = {
    ...process.env,
    LIGHTPANDA_DISABLE_TELEMETRY: String(!(options.telemetry ?? false)),
    ...options.env,
  };
  const versionPath = options.versionPath ?? "/json/version";
  if (typeof versionPath !== "string") {
    throw new Error("versionPath must be a string");
  }
  // 🛡️ Sentinel: Prevent HTTP Request Splitting via CRLF injection in versionPath
  if (/[\r\n]/.test(versionPath)) {
    throw new Error("versionPath cannot contain CRLF characters");
  }
  if (!versionPath.startsWith("/")) {
    throw new Error("versionPath must start with a single slash");
  }
  if (versionPath.startsWith("//")) {
    throw new Error("versionPath must start with a single '/' and cannot start with '//'");
  }
  return {
    args,
    command: options.command ?? "lightpanda",
    env,
    host,
    logger: options.logger ?? console,
    onUnexpectedExit: options.onUnexpectedExit ?? (() => undefined),
    port,
    probeTimeoutMs: options.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS,
    readyTimeoutMs: options.readyTimeoutMs ?? DEFAULT_READY_TIMEOUT_MS,
    shutdownRegistry: options.shutdownRegistry,
    shutdownTimeoutMs: options.shutdownTimeoutMs ?? DEFAULT_SHUTDOWN_TIMEOUT_MS,
    spawnOptions: options.spawnOptions ?? {},
    stdio: options.stdio ?? ["ignore", "inherit", "inherit"],
    versionPath,
  };
}
