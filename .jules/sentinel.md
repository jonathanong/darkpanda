## 2024-05-28 - Socket connection DoS risk in Lightpanda startup

**Vulnerability:** The `waitForPort` function used `net.connect` to verify if the Lightpanda port was ready. If the target host (e.g. `10.255.255.1`) dropped packets silently instead of rejecting them, the connection attempt would hang indefinitely, bypassing the `readyTimeoutMs` check.

**Learning:** `net.connect` in Node.js does not respect a timeout by default when the underlying TCP handshake is blocked or tarpitted. We must explicitly set `.setTimeout()` on the socket to ensure `readyTimeoutMs` applies not only to the overall polling period but also to individual connection attempts.

**Prevention:** Always set a `.setTimeout()` on sockets used for readiness checks to prevent indefinite hangs, especially when the host or port may drop packets silently.

## 2024-05-26 - Uncaught Synchronous Exceptions in Promise Polling Loops

**Vulnerability:** A `net.connect()` call inside a `setTimeout` within a Promise executor wasn't wrapped in a `try/catch`. When `net.connect()` threw a synchronous error (e.g. invalid port, unescaped path, mocking/internal error) during retry loops, it threw outside the context of the initial synchronous Promise executor, resulting in an unhandled exception that crashed the Node.js process. This poses a Denial of Service (DoS) risk if a configuration causes intermittent sync throws.

**Learning:** When writing polling or retry mechanisms using `setTimeout` inside a `Promise`, exceptions thrown synchronously during the `setTimeout` callback will _not_ be caught by the Promise executor. They must be explicitly wrapped in a `try/catch` block that rejects the Promise.

**Prevention:** Always wrap all operations inside a `setTimeout` callback with a `try/catch` if they belong to a `Promise` and can potentially throw synchronous exceptions (especially external network API calls like `net.connect` or `http.get`), and explicitly call `reject(err)`.

## 2024-05-18 - Prevent HTTP Request Splitting

**Vulnerability:** The `versionPath` option in `LightpandaOptions` was not validated for CRLF characters (`\r` or `\n`) before being passed to `http.get()`. This allowed malicious actors to potentially inject arbitrary HTTP headers or additional requests via HTTP Request Splitting/Smuggling, if they controlled the path passed to the `startLightpanda` manager.
**Learning:** Node.js's built-in `http.get` does not strictly sanitize all inputs within the path argument against CRLF control characters before v20 (and some contexts in newer versions). We must validate and sanitize all options used in network requests, especially path segments, to ensure they do not contain unescaped characters or payload injection vectors.
**Prevention:** Always validate configuration fields used in HTTP URLs and paths, specifically checking for `[\r\n]` to prevent CRLF injection.
