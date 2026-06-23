## 2024-05-28 - Socket connection DoS risk in Lightpanda startup

**Vulnerability:** The `waitForPort` function used `net.connect` to verify if the Lightpanda port was ready. If the target host (e.g. `10.255.255.1`) dropped packets silently instead of rejecting them, the connection attempt would hang indefinitely, bypassing the `readyTimeoutMs` check.

**Learning:** `net.connect` in Node.js does not respect a timeout by default when the underlying TCP handshake is blocked or tarpitted. We must explicitly set `.setTimeout()` on the socket to ensure `readyTimeoutMs` applies not only to the overall polling period but also to individual connection attempts.

**Prevention:** Always set a `.setTimeout()` on sockets used for readiness checks to prevent indefinite hangs, especially when the host or port may drop packets silently.

## 2024-05-26 - Uncaught Synchronous Exceptions in Promise Polling Loops

**Vulnerability:** A `net.connect()` call inside a `setTimeout` within a Promise executor wasn't wrapped in a `try/catch`. When `net.connect()` threw a synchronous error (e.g. invalid port, unescaped path, mocking/internal error) during retry loops, it threw outside the context of the initial synchronous Promise executor, resulting in an unhandled exception that crashed the Node.js process. This poses a Denial of Service (DoS) risk if a configuration causes intermittent sync throws.

**Learning:** When writing polling or retry mechanisms using `setTimeout` inside a `Promise`, exceptions thrown synchronously during the `setTimeout` callback will _not_ be caught by the Promise executor. They must be explicitly wrapped in a `try/catch` block that rejects the Promise.

**Prevention:** Always wrap all operations inside a `setTimeout` callback with a `try/catch` if they belong to a `Promise` and can potentially throw synchronous exceptions (especially external network API calls like `net.connect` or `http.get`), and explicitly call `reject(err)`.

## 2024-06-23 - HTTP Request Splitting in Node.js `http.get`

**Vulnerability:** Node.js native `http` module functions (like `http.get`) do not natively strictly sanitize the input `path` option against Carriage Return Line Feed (CRLF - `\r\n`) characters in older versions, and may be configured or used in ways that allow CRLF injection. If user-controlled input containing CRLF characters is passed to the `path` argument, it can lead to HTTP Request Splitting. This allows attackers to inject new headers or manipulate the HTTP request structure.

**Learning:** When passing dynamically generated paths or options (like `options.versionPath`) to Node.js `http.get`, we must manually validate against CRLF characters to prevent HTTP Request Splitting vulnerabilities, because native Node.js escaping may not cover all input configurations.

**Prevention:** Explicitly reject inputs intended for HTTP paths or headers if they contain `\r` or `\n` characters via regex testing (e.g. `if (/[\r\n]/.test(path)) throw new Error(...)`).
