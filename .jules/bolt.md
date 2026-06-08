## 2023-05-22 - Formatting markdown

**Learning:** `oxfmt` enforces formatting for all files including markdown. Be careful not to leave unformatted markdown in the project unless intentionally skipped, as it will break the `pnpm format:check` CI.
**Action:** Always test formatting after making any edits or adding new markdown files.

## 2024-05-25 - Node.js HTTP Keep-Alive Hangs and Probe Latency

**Learning:** When using `http.get` for quick status checks/probes against a server, not opting out of the global keep-alive agent (using `agent: false`) keeps a socket alive in the pool. This open socket holds an active Node.js handle, delaying process exit until the socket times out naturally (typically 4-5 seconds). Furthermore, draining a response body (`res.resume()`) takes more time and memory than immediately destroying the socket (`req.destroy()`) when only the HTTP status code is needed.
**Action:** Always pass `agent: false` when performing one-off HTTP probes in Node.js to ensure immediate cleanup. Use `req.destroy()` to abort the download early if only headers/status are needed, saving download time and memory.

## 2024-10-24 - Async singleton initialization

**Learning:** When using singleton patterns for startup processes (like spawning a browser or connecting to a database), checking for an already resolved controller (`if (controller !== undefined)`) is insufficient if the initialization is asynchronous. Concurrent calls will bypass the check and trigger duplicate expensive initializations, which can cause race conditions or duplicate processes.
**Action:** Always memoize the `Promise` of the initialization rather than the resolved value. Remember to handle rejections by clearing the promise so subsequent attempts can retry instead of caching a permanently broken state.

## 2024-05-18 - Promise.race Background Leak

**Learning:** In Node.js, `Promise.race` does not actively cancel the losing promises. If a background process involves polling (like port readiness) and another task rejects the race (like process startup failure), the polling can continue indefinitely in the background and consume resources until its own timeout resolves.
**Action:** When using `Promise.race` for concurrent tasks that wrap asynchronous actions like polling, use `AbortController` to gracefully clean up timers and sockets of the remaining tasks after the race finishes or throws.
