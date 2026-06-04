## 2023-05-22 - Formatting markdown

**Learning:** `oxfmt` enforces formatting for all files including markdown. Be careful not to leave unformatted markdown in the project unless intentionally skipped, as it will break the `pnpm format:check` CI.
**Action:** Always test formatting after making any edits or adding new markdown files.

## 2024-05-25 - Node.js HTTP Keep-Alive Hangs and Probe Latency

**Learning:** When using `http.get` for quick status checks/probes against a server, not opting out of the global keep-alive agent (using `agent: false`) keeps a socket alive in the pool. This open socket holds an active Node.js handle, delaying process exit until the socket times out naturally (typically 4-5 seconds). Furthermore, draining a response body (`res.resume()`) takes more time and memory than immediately destroying the socket (`req.destroy()`) when only the HTTP status code is needed.
**Action:** Always pass `agent: false` when performing one-off HTTP probes in Node.js to ensure immediate cleanup. Use `req.destroy()` to abort the download early if only headers/status are needed, saving download time and memory.

## 2024-10-24 - Async singleton initialization

**Learning:** When using singleton patterns for startup processes (like spawning a browser or connecting to a database), checking for an already resolved controller (`if (controller !== undefined)`) is insufficient if the initialization is asynchronous. Concurrent calls will bypass the check and trigger duplicate expensive initializations, which can cause race conditions or duplicate processes.
**Action:** Always memoize the `Promise` of the initialization rather than the resolved value. Remember to handle rejections by clearing the promise so subsequent attempts can retry instead of caching a permanently broken state.

## 2024-06-04 - Use AbortController for background promises in Promise.race

**Learning:** Background resource leaks occur when tasks like port polling continue running after a fast `Promise.race()` path (e.g., process error streams) has already rejected. Since Javascript promises are eager and don't natively cancel, the loser task hangs and consumes resources unproductively.
**Action:** When using `Promise.race` for concurrent background tasks, pass an `AbortController` signal to actively cancel the pending/losing task when the race completes or throws.
