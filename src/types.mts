import type { ChildProcess, SpawnOptions } from "node:child_process";

export interface LightpandaLogger {
  error(message?: unknown, ...args: unknown[]): void;
}

export interface LightpandaShutdownRegistry {
  add(callback: () => Promise<void>): void;
}

export interface LightpandaOptions {
  args?: readonly string[];
  blockPrivateNetworks?: boolean;
  command?: string;
  env?: NodeJS.ProcessEnv;
  host?: string;
  logLevel?: string;
  logger?: LightpandaLogger;
  onUnexpectedExit?: (reason: string) => void;
  port?: number;
  probeTimeoutMs?: number;
  readyTimeoutMs?: number;
  shutdownRegistry?: LightpandaShutdownRegistry;
  shutdownTimeoutMs?: number;
  spawnOptions?: SpawnOptions;
  stdio?: SpawnOptions["stdio"];
  telemetry?: boolean;
  versionPath?: string;
}

export interface LightpandaController {
  readonly cdpUrl: string;
  readonly host: string;
  readonly port: number;
  readonly process: ChildProcess | undefined;
  readonly spawned: boolean;
  stop(): Promise<void>;
}

export interface LightpandaManager {
  start(options?: LightpandaOptions): Promise<LightpandaController>;
}

export interface NormalizedOptions {
  args: readonly string[];
  command: string;
  env: NodeJS.ProcessEnv;
  host: string;
  logger: LightpandaLogger;
  onUnexpectedExit: (reason: string) => void;
  port: number;
  probeTimeoutMs: number;
  readyTimeoutMs: number;
  shutdownRegistry: LightpandaShutdownRegistry | undefined;
  shutdownTimeoutMs: number;
  spawnOptions: SpawnOptions;
  stdio: SpawnOptions["stdio"];
  versionPath: string;
}
