import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchWithRetry, fetchJson, fetchText, isRetriable } from '../src/net.js';

// A fake global fetch driven by a scripted list of outcomes (Response or throw).
// Each call shifts the next outcome; records how many attempts were made.
function fakeFetch(outcomes) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const next = outcomes.shift();
    if (typeof next === 'function') return next();
    return next;
  };
  fn.calls = calls;
  return fn;
}

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  };
}

// Swap the global fetch for the duration of `run`, then restore it.
async function withFetch(fn, run) {
  const original = globalThis.fetch;
  globalThis.fetch = fn;
  try {
    return await run();
  } finally {
    globalThis.fetch = original;
  }
}

// No real waiting — record the backoff delays instead.
function recordingSleep() {
  const delays = [];
  const sleepFn = async (ms) => { delays.push(ms); };
  sleepFn.delays = delays;
  return sleepFn;
}

test('fetchJson: returns parsed body on first 200', async () => {
  const fetchFn = fakeFetch([jsonResponse(200, { hello: 'world' })]);
  await withFetch(fetchFn, async () => {
    const data = await fetchJson('https://x/y.json', { sleepFn: recordingSleep() });
    assert.deepEqual(data, { hello: 'world' });
    assert.equal(fetchFn.calls.length, 1);
  });
});

test('fetchText: returns body text on first 200', async () => {
  const fetchFn = fakeFetch([{ ok: true, status: 200, text: async () => 'SKILL' }]);
  await withFetch(fetchFn, async () => {
    const text = await fetchText('https://x/SKILL.md', { sleepFn: recordingSleep() });
    assert.equal(text, 'SKILL');
  });
});

test('fetchWithRetry: retries a 500 then succeeds, with exponential backoff', async () => {
  const fetchFn = fakeFetch([jsonResponse(500), jsonResponse(200, { ok: 1 })]);
  const sleepFn = recordingSleep();
  await withFetch(fetchFn, async () => {
    const res = await fetchWithRetry('https://x/y.json', { retries: 2, backoffMs: 100, sleepFn });
    assert.equal(res.status, 200);
  });
  assert.equal(fetchFn.calls.length, 2);      // one retry
  assert.deepEqual(sleepFn.delays, [100]);     // backoffMs * 2**0
});

test('fetchWithRetry: does not retry a 404', async () => {
  const fetchFn = fakeFetch([jsonResponse(404), jsonResponse(200, { never: 1 })]);
  const sleepFn = recordingSleep();
  await withFetch(fetchFn, async () => {
    await assert.rejects(
      fetchWithRetry('https://x/missing.json', { retries: 3, sleepFn }),
      /HTTP 404/
    );
  });
  assert.equal(fetchFn.calls.length, 1);   // no retry on a permanent 4xx
  assert.deepEqual(sleepFn.delays, []);
});

test('fetchWithRetry: exhausts retries on persistent network error', async () => {
  const boom = () => { throw new Error('ECONNREFUSED'); };
  const fetchFn = fakeFetch([boom, boom, boom]);
  const sleepFn = recordingSleep();
  await withFetch(fetchFn, async () => {
    await assert.rejects(
      fetchWithRetry('https://x/y.json', { retries: 2, backoffMs: 50, sleepFn }),
      /ECONNREFUSED/
    );
  });
  assert.equal(fetchFn.calls.length, 3);        // initial + 2 retries
  assert.deepEqual(sleepFn.delays, [50, 100]);  // 50*2**0, 50*2**1
});

test('fetchWithRetry: retries=0 makes exactly one attempt', async () => {
  const fetchFn = fakeFetch([jsonResponse(503)]);
  const sleepFn = recordingSleep();
  await withFetch(fetchFn, async () => {
    await assert.rejects(fetchWithRetry('https://x/y.json', { retries: 0, sleepFn }), /HTTP 503/);
  });
  assert.equal(fetchFn.calls.length, 1);
  assert.deepEqual(sleepFn.delays, []);
});

test('isRetriable: timeouts, 5xx, 429 and network errors retry; other 4xx do not', () => {
  assert.equal(isRetriable({ name: 'TimeoutError' }), true);
  assert.equal(isRetriable({ name: 'AbortError' }), true);
  assert.equal(isRetriable({ status: 500 }), true);
  assert.equal(isRetriable({ status: 503 }), true);
  assert.equal(isRetriable({ status: 429 }), true);
  assert.equal(isRetriable(new Error('ECONNREFUSED')), true); // network-layer throw
  assert.equal(isRetriable({ status: 404 }), false);
  assert.equal(isRetriable({ status: 403 }), false);
  assert.equal(isRetriable({ status: 400 }), false);
  assert.equal(isRetriable(null), false);
});
