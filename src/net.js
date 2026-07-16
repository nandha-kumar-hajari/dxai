// Shared network helpers: fetch with a per-attempt timeout, bounded retries, and
// exponential backoff. The registry refresh and skill downloads both route through
// here so timeout/retry behaviour lives in exactly one place instead of being
// re-implemented (or forgotten) at each call site.

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRIES = 2; // total attempts = retries + 1
const DEFAULT_BACKOFF_MS = 300; // base delay, doubled each retry

// Injectable so tests can advance "time" without real waits.
export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Worth retrying? Transient failures (timeouts, dropped connections, 5xx, 429)
// are; a definitive 4xx (bad URL, 404, 403) is permanent, so retrying just
// wastes the caller's time and hammers the server.
export function isRetriable(err) {
  if (!err) return false;
  if (err.name === 'AbortError' || err.name === 'TimeoutError') return true;
  if (typeof err.status === 'number') {
    if (err.status === 429) return true;
    if (err.status >= 500) return true;
    if (err.status >= 400) return false; // other 4xx — don't retry
  }
  // fetch() rejected at the network layer (DNS, connection refused, TLS): retry.
  return true;
}

// Fetch with a fresh AbortSignal.timeout per attempt and exponential backoff
// between retries. Returns the Response on the first 2xx; throws the last error
// once retries are exhausted (or immediately for a non-retriable status).
export async function fetchWithRetry(url, opts = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    backoffMs = DEFAULT_BACKOFF_MS,
    redirect = 'follow',
    sleepFn = sleep,
  } = opts;

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { redirect, signal: AbortSignal.timeout(timeoutMs) });
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status} for ${url}`);
        err.status = res.status;
        throw err;
      }
      return res;
    } catch (err) {
      lastErr = err;
      if (attempt < retries && isRetriable(err)) {
        await sleepFn(backoffMs * 2 ** attempt);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function fetchJson(url, opts) {
  const res = await fetchWithRetry(url, opts);
  return res.json();
}

export async function fetchText(url, opts) {
  const res = await fetchWithRetry(url, opts);
  return res.text();
}
