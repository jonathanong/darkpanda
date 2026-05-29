## 2024-05-15 - Unbounded TCP Socket Connection (DoS)

**Vulnerability:** Node.js `net.connect` can hang indefinitely if the target host silently drops packets (blackholes the connection) without rejecting it. This bypassed the application's `readyTimeoutMs` logic which only checked deadlines on connection success or error.
**Learning:** Checking timeouts only on socket `error` or `connect` events is insufficient for network resiliency. Unbounded socket connections can cause promises to hang forever, leading to resource exhaustion and potential Denial of Service.
**Prevention:** Always set an explicit socket-level timeout using `socket.setTimeout()` that matches the overall operation deadline, and handle the `timeout` event by destroying the socket with an error to force resolution.
