## 2024-10-24 - Memoize Initialization Promise to Prevent Concurrent Duplicate Spawns

**Learning:** In async process management libraries (like spawning `lightpanda`), if the memoization cache only stores the resolved value (e.g., `let defaultController: LightpandaController | undefined`), multiple concurrent calls to `start()` can all bypass the undefined check and kick off duplicate `isLightpandaRunning` probes and separate `spawn` operations. This leads to redundant initializations, duplicate HTTP calls, and extra child processes running and failing if the port collides.
**Action:** When memoizing asynchronous singletons or caching expensive async setups, store the `Promise` itself rather than the resolved value. If initialization fails, catch the error to clear the promise cache so subsequent calls can retry correctly.

## 2024-05-25 - Node.js HTTP Keep-Alive Hangs and Probe Latency

**Learning:** When using `http.get` for quick status checks/probes against a server, not opting out of the global keep-alive agent (using `agent: false`) keeps a socket alive in the pool. This open socket holds an active Node.js handle, delaying process exit until the socket times out naturally (typically 4-5 seconds). Furthermore, draining a response body (`res.resume()`) takes more time and memory than immediately destroying the socket (`req.destroy()`) when only the HTTP status code is needed.
**Action:** Always pass `agent: false` when performing one-off HTTP probes in Node.js to ensure immediate cleanup. Use `req.destroy()` to abort the download early if only headers/status are needed, saving download time and memory.

## 2023-05-22 - Formatting markdown

**Learning:** `oxfmt` enforces formatting for all files including markdown. Be careful not to leave unformatted markdown in the project unless intentionally skipped, as it will break the `pnpm format:check` CI.
**Action:** Always test formatting after making any edits or adding new markdown files.
