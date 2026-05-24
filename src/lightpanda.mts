import { spawn, type ChildProcess } from "node:child_process";
import net from "node:net";
import http from "node:http";
import { normalizeOptions } from "./options.mjs";
import type {
  LightpandaController,
  LightpandaManager,
  LightpandaOptions,
  NormalizedOptions,
} from "./types.mjs";

export class LightpandaStartError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "LightpandaStartError";
  }
}

let defaultController: Promise<LightpandaController> | undefined;

export async function startLightpanda(options?: LightpandaOptions): Promise<LightpandaController> {
  if (defaultController !== undefined) return defaultController;
  const startup = startManagedLightpanda(normalizeOptions(options));
  defaultController = startup.catch((error) => {
    defaultController = undefined;
    throw error;
  });
  return defaultController;
}

export function createLightpandaManager(defaults: LightpandaOptions = {}): LightpandaManager {
  let controller: Promise<LightpandaController> | undefined;
  return {
    async start(overrides: LightpandaOptions = {}) {
      if (controller !== undefined) return controller;
      const startup = startManagedLightpanda(normalizeOptions({ ...defaults, ...overrides }));
      controller = startup.catch((error) => {
        controller = undefined;
        throw error;
      });
      return controller;
    },
  };
}

async function startManagedLightpanda(options: NormalizedOptions): Promise<LightpandaController> {
  const cdpUrl = getCdpUrl(options);
  if (await isLightpandaRunning(options)) {
    return createExternalController(options.host, options.port, cdpUrl);
  }

  const proc = spawn(options.command, [...options.args], {
    ...options.spawnOptions,
    env: options.env,
    stdio: options.stdio,
  });
  const runtime = createRuntimeState(proc, options);
  try {
    await Promise.race([runtime.startupError, waitForPort(options)]);
  } catch (err) {
    proc.kill("SIGTERM");
    throw err;
  }
  runtime.markStarted();
  const controller = createSpawnedController(options, cdpUrl, runtime);
  options.shutdownRegistry?.add(controller.stop);
  return controller;
}

async function isLightpandaRunning(options: NormalizedOptions): Promise<boolean> {
  const { probeTimeoutMs } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), probeTimeoutMs);
  try {
    const baseUrl = getBaseUrl(options);
    const versionUrl = new URL(options.versionPath, baseUrl);
    if (versionUrl.origin !== baseUrl.origin) {
      return false;
    }
    return await new Promise<boolean>((resolve, reject) => {
      const req = http.get(versionUrl, { method: "GET", signal: controller.signal }, (response) => {
        response.resume();
        resolve(response.statusCode !== undefined && response.statusCode >= 200 && response.statusCode < 300);
      });
      req.once("error", reject);
    });
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function getBaseUrl(options: NormalizedOptions): URL {
  const baseUrl = new URL("http://localhost");
  baseUrl.hostname = options.host;
  baseUrl.port = String(options.port);
  return baseUrl;
}

function getCdpUrl(options: NormalizedOptions): string {
  const cdpUrl = new URL("ws://localhost");
  cdpUrl.hostname = options.host;
  cdpUrl.port = String(options.port);
  return cdpUrl.origin;
}

function waitForPort(options: NormalizedOptions): Promise<void> {
  const deadline = Date.now() + options.readyTimeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const socket = net.connect(options.port, options.host);
      socket.once("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.once("error", () => {
        socket.destroy();
        if (Date.now() >= deadline) {
          reject(
            new LightpandaStartError(
              `Lightpanda not ready after ${options.readyTimeoutMs}ms on ${options.host}:${options.port}`,
            ),
          );
          return;
        }
        setTimeout(attempt, 25).unref();
      });
    };
    attempt();
  });
}

function createRuntimeState(proc: ChildProcess, options: NormalizedOptions) {
  let resolveStop: (() => void) | undefined;
  let sigkillTimer: ReturnType<typeof setTimeout> | undefined;
  let started = false;
  let stopped = false;
  const startupError = new Promise<void>((_, reject) => {
    proc.once("error", (err: NodeJS.ErrnoException) => {
      const message = err.code === "ENOENT" ? "lightpanda binary not found on PATH" : err.message;
      reject(new LightpandaStartError(message, { cause: err }));
    });
    proc.once("exit", (code, signal) => {
      stopped = true;
      if (sigkillTimer !== undefined) clearTimeout(sigkillTimer);
      if (resolveStop !== undefined) {
        resolveStop();
        return;
      }
      const reason = code !== null ? `code ${code}` : `signal ${signal}`;
      if (started) {
        options.logger.error(`Lightpanda exited unexpectedly with ${reason}`);
        options.onUnexpectedExit(reason);
        return;
      }
      reject(
        new LightpandaStartError(
          `Lightpanda exited with ${reason} before port ${options.host}:${options.port} was ready`,
        ),
      );
    });
  });
  startupError.catch(() => undefined);
  return {
    get process() {
      return proc;
    },
    markStarted() {
      started = true;
    },
    startupError,
    stop() {
      return new Promise<void>((resolve) => {
        resolveStop = resolve;
        if (stopped) {
          resolve();
          return;
        }
        proc.kill("SIGTERM");
        sigkillTimer = setTimeout(() => {
          proc.kill("SIGKILL");
          resolve();
        }, options.shutdownTimeoutMs);
        sigkillTimer.unref();
      });
    },
  };
}

function createExternalController(
  host: string,
  port: number,
  cdpUrl: string,
): LightpandaController {
  return { cdpUrl, host, port, process: undefined, spawned: false, stop: async () => {} };
}

function createSpawnedController(
  options: NormalizedOptions,
  cdpUrl: string,
  runtime: ReturnType<typeof createRuntimeState>,
): LightpandaController {
  return {
    cdpUrl,
    host: options.host,
    port: options.port,
    process: runtime.process,
    spawned: true,
    stop: runtime.stop,
  };
}
