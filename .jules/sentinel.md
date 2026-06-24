## 2024-05-28 - Socket connection DoS risk in Lightpanda startup

**Vulnerability:** The `waitForPort` function used `net.connect` to verify if the Lightpanda port was ready. If the target host (e.g. `10.255.255.1`) dropped packets silently instead of rejecting them, the connection attempt would hang indefinitely, bypassing the `readyTimeoutMs` check.

**Learning:** `net.connect` in Node.js does not respect a timeout by default when the underlying TCP handshake is blocked or tarpitted. We must explicitly set `.setTimeout()` on the socket to ensure `readyTimeoutMs` applies not only to the overall polling period but also to individual connection attempts.

**Prevention:** Always set a `.setTimeout()` on sockets used for readiness checks to prevent indefinite hangs, especially when the host or port may drop packets silently.

## 2024-05-26 - Uncaught Synchronous Exceptions in Promise Polling Loops

**Vulnerability:** A `net.connect()` call inside a `setTimeout` within a Promise executor wasn't wrapped in a `try/catch`. When `net.connect()` threw a synchronous error (e.g. invalid port, unescaped path, mocking/internal error) during retry loops, it threw outside the context of the initial synchronous Promise executor, resulting in an unhandled exception that crashed the Node.js process. This poses a Denial of Service (DoS) risk if a configuration causes intermittent sync throws.

**Learning:** When writing polling or retry mechanisms using `setTimeout` inside a `Promise`, exceptions thrown synchronously during the `setTimeout` callback will _not_ be caught by the Promise executor. They must be explicitly wrapped in a `try/catch` block that rejects the Promise.

**Prevention:** Always wrap all operations inside a `setTimeout` callback with a `try/catch` if they belong to a `Promise` and can potentially throw synchronous exceptions (especially external network API calls like `net.connect` or `http.get`), and explicitly call `reject(err)`.

## 2024-06-24 - HTTP Request Splitting via CRLF injection in Node.js client

**Vulnerability:** The `options.versionPath` property was directly passed into the `path` property of `http.get()` without sanitization. An attacker supplying a path like `/json/version\r\nEvil-Header: true` could inject CRLF (`\r\n`) sequences, leading to an HTTP Request Splitting vulnerability where malicious headers or an entirely new HTTP request are spliced onto the stream. Node.js natively does not rigorously validate these fields, especially in older versions, meaning developers must handle them explicitly.

**Learning:** Any user-configurable parts of an HTTP request (such as URL paths, query strings, and custom headers) passed to Node.js core modules (`http` or `net`) must be explicitly sanitized against CRLF characters (`\r` and `\n`).

**Prevention:** Use a regular expression like `/[\r\n]/` to reject inputs containing newline characters before passing them to native network clients.
