# darkpanda

Extensible Lightpanda process management for Node.js. The package starts a
Lightpanda browser process, waits for its Chrome DevTools Protocol port to be
ready, and shuts the child process down cleanly when your application exits.

## Install

```sh
pnpm add darkpanda
```

Install the `lightpanda` binary separately and make sure it is available on
`PATH`. See the Lightpanda browser releases for platform-specific binaries:
<https://github.com/lightpanda-io/browser/releases>.

## Usage

```ts
import { startLightpanda } from "darkpanda";

const browser = await startLightpanda();

console.log(browser.cdpUrl); // ws://127.0.0.1:9222
```

By default, `startLightpanda()`:

- probes `http://127.0.0.1:9222/json/version` and reuses an existing browser
- spawns `lightpanda serve --host 127.0.0.1 --port 9222 --log-level error`
- enables `--block-private-networks`
- sets `LIGHTPANDA_DISABLE_TELEMETRY=true`
- waits up to 15 seconds for the CDP port
- sends `SIGTERM` on shutdown, then `SIGKILL` after 5 seconds if needed

## Managed Shutdown

Use a shutdown registry to connect Darkpanda to your application's existing
graceful-shutdown system:

```ts
import { createLightpandaManager } from "darkpanda";

const shutdownCallbacks: Array<() => Promise<void>> = [];
const lightpanda = createLightpandaManager({
  shutdownRegistry: {
    add: (callback) => shutdownCallbacks.push(callback),
  },
});

await lightpanda.start();

for (const callback of shutdownCallbacks) {
  await callback();
}
```

## Configuration

```ts
import { createLightpandaManager } from "darkpanda";

const lightpanda = createLightpandaManager({
  command: "/usr/local/bin/lightpanda",
  host: "127.0.0.1",
  port: 9333,
  readyTimeoutMs: 20_000,
  shutdownTimeoutMs: 3_000,
  logLevel: "warn",
  blockPrivateNetworks: true,
  telemetry: false,
  onUnexpectedExit: (reason) => {
    console.error(`Lightpanda exited: ${reason}`);
  },
});

const controller = await lightpanda.start();
```

For advanced use, pass `args` to replace the generated `serve` arguments or
`spawnOptions` to pass additional Node.js child-process options.

### Options

| Option                 | Default                            | Description                                                 |
| ---------------------- | ---------------------------------- | ----------------------------------------------------------- |
| `command`              | `lightpanda`                       | Executable to spawn.                                        |
| `args`                 | generated `serve` args             | Full argument list. Supplying this replaces generated args. |
| `host`                 | `127.0.0.1`                        | CDP host to probe and pass to generated args.               |
| `port`                 | `9222`                             | CDP port to probe and pass to generated args.               |
| `logLevel`             | `error`                            | Value for generated `--log-level`.                          |
| `blockPrivateNetworks` | `true`                             | Adds generated `--block-private-networks`.                  |
| `telemetry`            | `false`                            | Sets `LIGHTPANDA_DISABLE_TELEMETRY` to the inverse value.   |
| `probeTimeoutMs`       | `2000`                             | Timeout for the `/json/version` reuse probe.                |
| `readyTimeoutMs`       | `15000`                            | Maximum time to wait for the CDP port after spawn.          |
| `shutdownTimeoutMs`    | `5000`                             | Time between `SIGTERM` and fallback `SIGKILL`.              |
| `versionPath`          | `/json/version`                    | HTTP path used to detect an existing browser.               |
| `env`                  | `process.env`                      | Extra child-process environment values.                     |
| `stdio`                | `["ignore", "inherit", "inherit"]` | Child-process stdio setting.                                |
| `spawnOptions`         | `{}`                               | Additional `child_process.spawn` options.                   |
| `logger`               | `console`                          | Receives unexpected process-exit errors.                    |
| `onUnexpectedExit`     | no-op                              | Callback for child exits after successful startup.          |
| `shutdownRegistry`     | unset                              | Optional registry for application shutdown callbacks.       |

## API

### `startLightpanda(options?)`

Starts one process with module-level memoization and returns a
`LightpandaController`. Repeated calls return the same controller.

### `createLightpandaManager(defaults?)`

Creates an isolated manager. Use this when tests, workers, or multiple browser
profiles need separate lifecycle state.

### `LightpandaController`

- `cdpUrl`: WebSocket CDP URL, for example `ws://127.0.0.1:9222`
- `host`: host passed to the manager
- `port`: port passed to the manager
- `process`: the child process, or `undefined` when an external browser was reused
- `spawned`: whether this manager spawned the process
- `stop()`: stops the spawned process; no-ops for external browsers

## Development

```sh
pnpm install
pnpm verify
```

Coverage is enforced at 100% for statements, branches, functions, and lines.
The tests use real sockets and child processes with a fixture executable; they
do not mock Node.js modules.

## Release

Use the GitHub Actions `Release` workflow to publish. It accepts a semver bump
type, commits the version bump to `main`, creates an annotated tag, publishes to
npm with provenance through GitHub OIDC, and creates a GitHub release.

Repository setup required:

- npm trusted publishing enabled for this package
- `RELEASE_TOKEN` secret with permission to push release commits and tags
- branch protection configured so the token owner can perform release pushes
