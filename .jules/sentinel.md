## 2024-05-28 - Socket connection DoS risk in Lightpanda startup

**Vulnerability:** The `waitForPort` function used `net.connect` to verify if the Lightpanda port was ready. If the target host (e.g. `10.255.255.1`) dropped packets silently instead of rejecting them, the connection attempt would hang indefinitely, bypassing the `readyTimeoutMs` check.

**Learning:** `net.connect` in Node.js does not respect a timeout by default when the underlying TCP handshake is blocked or tarpitted. We must explicitly set `.setTimeout()` on the socket to ensure `readyTimeoutMs` applies not only to the overall polling period but also to individual connection attempts.

**Prevention:** Always set a `.setTimeout()` on sockets used for readiness checks to prevent indefinite hangs, especially when the host or port may drop packets silently.

## 2024-05-26 - Uncaught Synchronous Exceptions in Promise Polling Loops

**Vulnerability:** A `net.connect()` call inside a `setTimeout` within a Promise executor wasn't wrapped in a `try/catch`. When `net.connect()` threw a synchronous error (e.g. invalid port, unescaped path, mocking/internal error) during retry loops, it threw outside the context of the initial synchronous Promise executor, resulting in an unhandled exception that crashed the Node.js process. This poses a Denial of Service (DoS) risk if a configuration causes intermittent sync throws.

**Learning:** When writing polling or retry mechanisms using `setTimeout` inside a `Promise`, exceptions thrown synchronously during the `setTimeout` callback will _not_ be caught by the Promise executor. They must be explicitly wrapped in a `try/catch` block that rejects the Promise.

**Prevention:** Always wrap all operations inside a `setTimeout` callback with a `try/catch` if they belong to a `Promise` and can potentially throw synchronous exceptions (especially external network API calls like `net.connect` or `http.get`), and explicitly call `reject(err)`.

## 2024-06-06 - [Fix orphaned background tasks and zombie processes during process startup failures]

**Vulnerability:** A `Promise.race` was used between a port polling function (`waitForPort`) and a child process startup error (`runtime.startupError`). If the process failed to start, the `Promise.race` rejected immediately, but `waitForPort`'s internal socket polling loop continued running in the background until its timeout, creating a resource leak and orphaned background tasks. Additionally, the `catch` block for the startup error directly called `proc.kill("SIGTERM")` instead of using the runtime's configured shutdown sequence, which left a zombie process if the child ignored the signal.
**Learning:** `Promise.race` does not actively cancel the "losing" promises. You must manually orchestrate cancellation (e.g., using `AbortController`) for any background tasks involved in a race. Furthermore, naive usage of `SIGTERM` on process exit fails to account for graceful shutdown timeouts and forced kill fallbacks.
**Prevention:** Pass an `AbortSignal` to concurrent background polling tasks involved in a `Promise.race` and actively call `abort()` in a `finally` block when the race completes or rejects. Use unified lifecycle termination methods (e.g. `runtime.stop()`) instead of raw `kill` signals.
