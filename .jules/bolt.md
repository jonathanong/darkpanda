## 2024-05-21 - Concurrent startups cause race condition

**Learning:** `startLightpanda` and `manager.start` check for a memoized controller using `if (controller !== undefined) return controller;` and then use `await` before assigning the controller `controller = await startManagedLightpanda(...)`. If these functions are called concurrently (e.g. `Promise.all([startLightpanda(), startLightpanda()])`), the `await` allows other tasks to run before `controller` is set, leading to `startManagedLightpanda` called multiple times and spawning multiple processes. This is both a performance issue and a functional bug.
**Action:** Store the _promise_ returned by `startManagedLightpanda` in the `controller` variable, rather than the resolved value. Then return the promise. This ensures that concurrent calls will await the same promise and only spawn one process.

## 2026-05-22 - Replacing fetch() with http.get() for faster cold start

**Learning:** Using the global `fetch()` API in Node.js (which uses Undici) has a noticeable cold start cost (often 40-150ms) compared to native `http.get`. When creating performance-critical checks (like an initialization probe), a native implementation provides a quick win. However, replacing async `fetch` with stream-based `http.get` means we must be careful to handle promises correctly, drain response streams (`res.resume()`), and especially retain `try/catch` or equivalent handling for synchronous throws (e.g. invalid arguments passed to `http.get`) to maintain fail-safe probe guarantees. Also, creating mock HTTP servers for tests without properly closing them (`server.close()`) leaves active TCP listeners, leading to hanging tests and blocked CI.
**Action:** When migrating from `fetch` to `http` or `https` for performance, always ensure synchronous configuration errors are caught so they don't cause unhandled promise rejections. Additionally, whenever creating mock HTTP servers in tests, always clean them up using `server.close()` inside a `finally` block to prevent CI pipeline hangs.

## 2023-05-22 - Formatting markdown

**Learning:** `oxfmt` enforces formatting for all files including markdown. Be careful not to leave unformatted markdown in the project unless intentionally skipped, as it will break the `pnpm format:check` CI.
**Action:** Always test formatting after making any edits or adding new markdown files.
