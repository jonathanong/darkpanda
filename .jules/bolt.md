## 2023-05-22 - Formatting markdown

**Learning:** `oxfmt` enforces formatting for all files including markdown. Be careful not to leave unformatted markdown in the project unless intentionally skipped, as it will break the `pnpm format:check` CI.
**Action:** Always test formatting after making any edits or adding new markdown files.

## 2024-05-25 - Node.js HTTP Keep-Alive Hangs and Probe Latency

**Learning:** When using `http.get` for quick status checks/probes against a server, not opting out of the global keep-alive agent (using `agent: false`) keeps a socket alive in the pool. This open socket holds an active Node.js handle, delaying process exit until the socket times out naturally (typically 4-5 seconds). Furthermore, draining a response body (`res.resume()`) takes more time and memory than immediately destroying the socket (`req.destroy()`) when only the HTTP status code is needed.
**Action:** Always pass `agent: false` when performing one-off HTTP probes in Node.js to ensure immediate cleanup. Use `req.destroy()` to abort the download early if only headers/status are needed, saving download time and memory.

## 2024-10-24 - Async singleton initialization

**Learning:** When using singleton patterns for startup processes (like spawning a browser or connecting to a database), checking for an already resolved controller (`if (controller !== undefined)`) is insufficient if the initialization is asynchronous. Concurrent calls will bypass the check and trigger duplicate expensive initializations, which can cause race conditions or duplicate processes.
**Action:** Always memoize the `Promise` of the initialization rather than the resolved value. Remember to handle rejections by clearing the promise so subsequent attempts can retry instead of caching a permanently broken state.

## 2024-12-19 - Concurrent Promises and Background Resource Leaks

**Learning:** When using `Promise.race` for concurrent tasks where one promise is expected to resolve/reject first (such as port polling vs. process error streams), the "losing" promises do not automatically stop running. In a port polling scenario, this can lead to orphaned timers (`setTimeout`) and socket connection attempts silently running in the background, consuming resources and potentially causing Node.js to stay alive unexpectedly.
**Action:** Always use an `AbortController` alongside `Promise.race` for concurrent background tasks. Call `abortController.abort()` in a `finally` block to actively cancel any pending or losing operations (like clearing timers and destroying active sockets) as soon as the race concludes.
