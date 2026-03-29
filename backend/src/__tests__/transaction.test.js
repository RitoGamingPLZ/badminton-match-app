import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { sleep, withRetry, withConflictRetry } from '../db/transaction.js';
import { VersionConflictError } from '../db/errors.js';
import { ServiceError } from '../errors.js';

describe('sleep', () => {
  test('resolves after at least the given duration', async () => {
    const start = Date.now();
    await sleep(50);
    assert.ok(Date.now() - start >= 40);
  });

  test('sleep(0) resolves immediately', async () => {
    await assert.doesNotReject(() => sleep(0));
  });
});

describe('withRetry', () => {
  test('returns result when function succeeds on first call', async () => {
    const result = await withRetry(() => Promise.resolve(42));
    assert.equal(result, 42);
  });

  test('propagates VersionConflictError after retries are exhausted', async () => {
    await assert.rejects(
      () => withRetry(() => Promise.reject(new VersionConflictError())),
      (err) => { assert.ok(err instanceof VersionConflictError); return true; },
    );
  });
});

describe('withConflictRetry', () => {
  test('returns result on first attempt', async () => {
    const result = await withConflictRetry(() => Promise.resolve('ok'), () => {});
    assert.equal(result, 'ok');
  });

  test('calls onConflict and retries after VersionConflictError', async () => {
    let attempt = 0;
    let conflictCalled = 0;
    const result = await withConflictRetry(
      () => {
        if (attempt++ === 0) throw new VersionConflictError();
        return Promise.resolve('retried');
      },
      async () => { conflictCalled++; },
    );
    assert.equal(result, 'retried');
    assert.equal(conflictCalled, 1);
  });

  test('propagates non-VersionConflict errors immediately', async () => {
    await assert.rejects(
      () => withConflictRetry(() => { throw new Error('unrelated'); }, () => {}),
      /unrelated/,
    );
  });

  test('throws 409 ServiceError after exhausting all retries', async () => {
    await assert.rejects(
      () => withConflictRetry(() => { throw new VersionConflictError(); }, async () => {}),
      (err) => {
        assert.ok(err instanceof ServiceError);
        assert.equal(err.status, 409);
        return true;
      },
    );
  });
});
