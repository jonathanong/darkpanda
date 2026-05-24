## 2024-10-18 - Memoizing pending promises

**Learning:** When writing async initialization logic, memoizing the resolved value after an `await` introduces a race condition for concurrent requests. If two calls occur before the first finishes, the initialization function runs twice. Caching the `Promise` itself synchronously ensures all concurrent callers wait on the same execution instance.

**Action:** Look for modules or singletons that initialize state asynchronously and make sure they memoize the promise, not just the result. Always add `.catch` handlers to clear the cached promise if initialization fails, to avoid permanent error states.
