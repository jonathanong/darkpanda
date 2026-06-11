## 2024-05-28 - Socket connection DoS risk in Lightpanda startup

**Vulnerability:** The `waitForPort` function used `net.connect` to verify if the Lightpanda port was ready. If the target host (e.g. `10.255.255.1`) dropped packets silently instead of rejecting them, the connection attempt would hang indefinitely, bypassing the `readyTimeoutMs` check.

**Learning:** `net.connect` in Node.js does not respect a timeout by default when the underlying TCP handshake is blocked or tarpitted. We must explicitly set `.setTimeout()` on the socket to ensure `readyTimeoutMs` applies not only to the overall polling period but also to individual connection attempts.

**Prevention:** Always set a `.setTimeout()` on sockets used for readiness checks to prevent indefinite hangs, especially when the host or port may drop packets silently.

## 2024-05-26 - Uncaught Synchronous Exceptions in Promise Polling Loops

**Vulnerability:** A `net.connect()` call inside a `setTimeout` within a Promise executor wasn't wrapped in a `try/catch`. When `net.connect()` threw a synchronous error (e.g. invalid port, unescaped path, mocking/internal error) during retry loops, it threw outside the context of the initial synchronous Promise executor, resulting in an unhandled exception that crashed the Node.js process. This poses a Denial of Service (DoS) risk if a configuration causes intermittent sync throws.

**Learning:** When writing polling or retry mechanisms using `setTimeout` inside a `Promise`, exceptions thrown synchronously during the `setTimeout` callback will _not_ be caught by the Promise executor. They must be explicitly wrapped in a `try/catch` block that rejects the Promise.

**Prevention:** Always wrap all operations inside a `setTimeout` callback with a `try/catch` if they belong to a `Promise` and can potentially throw synchronous exceptions (especially external network API calls like `net.connect` or `http.get`), and explicitly call `reject(err)`.

## 2025-02-12 - HTTP Request Splitting via Unsanitized Configuration Paths

**Vulnerability:** The `versionPath` option allowed arbitrary strings, including CRLF (`\r`, `\n`) characters. Since Node.js does not strictly sanitize options passed to `http.get`, an attacker could supply a payload like `/json/version\r\nHost: evil.com` to manipulate the underlying HTTP request stream, leading to HTTP Request Splitting.

**Learning:** When passing user-configurable string values into Node.js core HTTP modules (like `http.get` options), developers often assume the runtime will safely escape or reject invalid HTTP syntax. This is not always true, exposing applications to injection attacks when inputs control elements like headers or paths.

**Prevention:** Always explicitly validate against CRLF characters (`[\r\n]`) for any dynamic configuration value that will be used to construct parts of an HTTP request (like paths, headers, or method names) before passing them to native Node.js HTTP functions.
