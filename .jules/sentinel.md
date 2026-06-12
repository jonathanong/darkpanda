## 2024-05-28 - Socket connection DoS risk in Lightpanda startup

**Vulnerability:** The `waitForPort` function used `net.connect` to verify if the Lightpanda port was ready. If the target host (e.g. `10.255.255.1`) dropped packets silently instead of rejecting them, the connection attempt would hang indefinitely, bypassing the `readyTimeoutMs` check.

**Learning:** `net.connect` in Node.js does not respect a timeout by default when the underlying TCP handshake is blocked or tarpitted. We must explicitly set `.setTimeout()` on the socket to ensure `readyTimeoutMs` applies not only to the overall polling period but also to individual connection attempts.

**Prevention:** Always set a `.setTimeout()` on sockets used for readiness checks to prevent indefinite hangs, especially when the host or port may drop packets silently.

## 2024-05-26 - Uncaught Synchronous Exceptions in Promise Polling Loops

**Vulnerability:** A `net.connect()` call inside a `setTimeout` within a Promise executor wasn't wrapped in a `try/catch`. When `net.connect()` threw a synchronous error (e.g. invalid port, unescaped path, mocking/internal error) during retry loops, it threw outside the context of the initial synchronous Promise executor, resulting in an unhandled exception that crashed the Node.js process. This poses a Denial of Service (DoS) risk if a configuration causes intermittent sync throws.

**Learning:** When writing polling or retry mechanisms using `setTimeout` inside a `Promise`, exceptions thrown synchronously during the `setTimeout` callback will _not_ be caught by the Promise executor. They must be explicitly wrapped in a `try/catch` block that rejects the Promise.

**Prevention:** Always wrap all operations inside a `setTimeout` callback with a `try/catch` if they belong to a `Promise` and can potentially throw synchronous exceptions (especially external network API calls like `net.connect` or `http.get`), and explicitly call `reject(err)`.

## 2024-06-12 - HTTP Request Splitting via CRLF in versionPath

**Vulnerability:** The `versionPath` option in `LightpandaOptions` was user-configurable and passed directly into `http.get` in `src/lightpanda.mts`. Node.js does not always natively sanitize carriage return (`\r`) or line feed (`\n`) characters in HTTP request paths. An attacker could inject CRLF characters to manipulate the HTTP request headers, leading to HTTP Request Splitting.

**Learning:** When constructing HTTP requests with user-configurable paths (e.g., passing options to `http.get`), Node.js native libraries may not strictly sanitize inputs. This allows attackers to inject headers or even entirely new requests into the HTTP stream.

**Prevention:** Always explicitly validate against CRLF characters (`\r`, `\n`) when accepting user-configurable paths or headers that are passed to native Node.js HTTP functions like `http.get` or `http.request`.
