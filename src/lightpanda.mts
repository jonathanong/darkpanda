import { spawn, type ChildProcess } from "node:child_process";
import http from "node:http";
import net from "node:net";
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

// ⚡ Bolt: Memoize the Promise instead of the resolved controller to prevent concurrent calls
// from triggering redundant process spawns and port probes.
let defaultController: Promise<LightpandaController> | undefined;

// ⚡ Bolt: Added resetDefaultController for testing to clear memoized global state
// and prevent test bleed when testing failure recovery.
export function resetDefaultControllerForTest() {
  defaultController = undefined;
}

export function startLightpanda(options?: LightpandaOptions): Promise<LightpandaController> {
  if (defaultController !== undefined) return defaultController;

  // ⚡ Bolt: Cache the Promise instead of the resolved controller to prevent race conditions
  // on concurrent calls, avoiding multiple expensive and unnecessary process spawns.
  // We clear the cache on failure to allow subsequent retry attempts.
  defaultController = startManagedLightpanda(normalizeOptions(options)).catch((err) => {
    defaultController = undefined;
    throw err;
  });
  return defaultController;
}

export function createLightpandaManager(defaults: LightpandaOptions = {}): LightpandaManager {
  let controller: Promise<LightpandaController> | undefined;
  return {
    start(overrides: LightpandaOptions = {}) {
      if (controller !== undefined) return controller;

      // ⚡ Bolt: Cache the Promise instead of the resolved controller to prevent race conditions
      // on concurrent calls, avoiding multiple expensive and unnecessary process spawns.
      // We clear the cache on failure to allow subsequent retry attempts.
      controller = startManagedLightpanda(normalizeOptions({ ...defaults, ...overrides })).catch(
        (err) => {
          controller = undefined;
          throw err;
        },
      );
      return controller;

    },
  };
}

async function startManagedLightpanda(options: NormalizedOptions): Promise<LightpandaController> {
  const cdpUrl = `ws://${options.host}:${options.port}`;
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
  // ⚡ Bolt: Using http.get instead of fetch() to avoid Undici cold-start overhead,
  // which saves ~40-100ms on the initial probe when starting Lightpanda.
  try {
    return await new Promise((resolve) => {
      const req = http.get(
        {
          agent: false, // ⚡ Bolt: disable keep-alive to avoid socket leaks and process hangs
          host: options.host,
          port: options.port,
          path: options.versionPath,
          timeout: options.probeTimeoutMs,
        },
        (res) => {
          // ⚡ Bolt: destroy socket immediately instead of draining body to save download time/memory
          req.destroy();
          resolve(res.statusCode !== undefined && res.statusCode >= 200 && res.statusCode < 300);
        },
      );
      req.on("error", () => resolve(false));
      req.on("timeout", () => {
        req.destroy();
        resolve(false);
      });
    });
  } catch {
    return false;
  }
}

function waitForPort(options: NormalizedOptions): Promise<void> {
  const deadline = Date.now() + options.readyTimeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      try {
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
      } catch (err) {
        reject(err);
      }
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
