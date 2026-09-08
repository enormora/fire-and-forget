import assert from 'node:assert';
import timers from 'node:timers/promises';
import { suite, test } from 'mocha';

import { createFireAndForgetInvoker, type FireAndForgetInvoker } from './fire-and-forget-invoker.ts';
// eslint-disable-next-line no-barrel-files/prefer-source-imports -- Verify the intentional public package interface.
import { createFireAndForgetInvoker as publicCreateFireAndForgetInvoker } from './index.ts';

type DeferredPromise<Value> = {
    readonly promise: Promise<Value>;
    readonly resolve: (value: PromiseLike<Value> | Value) => void;
    readonly reject: (reason?: unknown) => void;
};

function createDeferredPromise<Value>(): DeferredPromise<Value> {
    let resolvePromise: (value: PromiseLike<Value> | Value) => void = function () {
        return undefined;
    };
    let rejectPromise: (reason?: unknown) => void = function () {
        return undefined;
    };
    const promise = new Promise<Value>(function (resolve, reject) {
        resolvePromise = resolve;
        rejectPromise = reject;
    });

    return {
        promise,
        resolve: resolvePromise,
        reject: rejectPromise
    };
}

async function resolveTrueWhenPromiseSettles(promise: Promise<unknown>): Promise<boolean> {
    await promise;
    return true;
}

suite('createFireAndForgetInvoker', function () {
    test('exports the factory from the package root', function () {
        assert.strictEqual(publicCreateFireAndForgetInvoker, createFireAndForgetInvoker);
    });

    test('drains an unused invoker and accepts new work after completion', async function () {
        const reportedErrors: unknown[] = [];
        const invoker = createFireAndForgetInvoker({
            reportError(error: unknown) {
                reportedErrors.push(error);
            }
        });
        await invoker.waitUntilAllSettled();
        invoker.fireAndForget(async function () {
            return 'ignored';
        });
        await invoker.waitUntilAllSettled();

        const nextAction = createDeferredPromise<undefined>();
        invoker.fireAndForget(async function () {
            return nextAction.promise;
        });
        const nextDrain = invoker.waitUntilAllSettled();
        const actualCompletion = await Promise.race([
            resolveTrueWhenPromiseSettles(nextDrain),
            timers.setImmediate()
        ]);
        assert.strictEqual(actualCompletion, undefined);
        nextAction.resolve(undefined);
        await nextDrain;
        assert.deepStrictEqual(reportedErrors, []);
    });

    test('settles concurrent drains after asynchronous reporting of a synchronous throw', async function () {
        const expectedError = new Error('synchronous action failure');
        const reporterCompletion = createDeferredPromise<undefined>();
        const reportedErrors: unknown[] = [];
        const invoker = createFireAndForgetInvoker({
            async reportError(error: unknown) {
                reportedErrors.push(error);
                return reporterCompletion.promise;
            }
        });
        invoker.fireAndForget(function () {
            throw expectedError;
        });
        const firstDrain = invoker.waitUntilAllSettled();
        const secondDrain = invoker.waitUntilAllSettled();
        const actualCompletion = await Promise.race([
            resolveTrueWhenPromiseSettles(firstDrain),
            resolveTrueWhenPromiseSettles(secondDrain),
            timers.setImmediate()
        ]);
        assert.strictEqual(actualCompletion, undefined);
        reporterCompletion.resolve(undefined);
        await Promise.all([ firstDrain, secondDrain ]);
        assert.deepStrictEqual(reportedErrors, [ expectedError ]);
    });

    test('observes concurrent reporter rejections independently', async function () {
        const firstError = new Error('first');
        const secondError = new Error('second');
        const firstReport = createDeferredPromise<undefined>();
        const secondReport = createDeferredPromise<undefined>();
        const reportedErrors: unknown[] = [];
        const invoker = createFireAndForgetInvoker({
            async reportError(error: unknown) {
                reportedErrors.push(error);
                return error === firstError ? firstReport.promise : secondReport.promise;
            }
        });
        invoker.fireAndForget(async function () {
            throw firstError;
        });
        invoker.fireAndForget(async function () {
            throw secondError;
        });
        const drain = invoker.waitUntilAllSettled();
        firstReport.reject(new Error('first reporter failure'));
        const actualCompletion = await Promise.race([
            resolveTrueWhenPromiseSettles(drain),
            timers.setImmediate()
        ]);
        assert.strictEqual(actualCompletion, undefined);
        secondReport.reject(new Error('second reporter failure'));
        await drain;
        assert.deepStrictEqual(reportedErrors, [ firstError, secondError ]);
    });

    test('invokes an action exactly once and returns immediately', async function () {
        const actionCompletion = createDeferredPromise<undefined>();
        let actionInvocationCount = 0;
        const fireAndForgetInvoker = createFireAndForgetInvoker({
            reportError() {
                throw new Error('reportError should not be called');
            }
        });

        fireAndForgetInvoker.fireAndForget(async function () {
            actionInvocationCount += 1;
            return actionCompletion.promise;
        });

        assert.strictEqual(actionInvocationCount, 1);
        actionCompletion.resolve(undefined);
        await fireAndForgetInvoker.waitUntilAllSettled();
    });

    test('waits for an outstanding action without exposing its result', async function () {
        const actionCompletion = createDeferredPromise<{ readonly result: string; }>();
        const fireAndForgetInvoker = createFireAndForgetInvoker({
            reportError() {
                throw new Error('reportError should not be called');
            }
        });

        fireAndForgetInvoker.fireAndForget(async function () {
            return actionCompletion.promise;
        });
        const drainPromise = fireAndForgetInvoker.waitUntilAllSettled();
        const drainCompletionPromise = resolveTrueWhenPromiseSettles(drainPromise);

        const actualDrainCompletionBeforeActionResolution = await Promise.race([
            drainCompletionPromise,
            timers.setImmediate()
        ]);
        assert.strictEqual(actualDrainCompletionBeforeActionResolution, undefined);

        actionCompletion.resolve({ result: 'ignored' });
        await drainPromise;
    });

    test('does not report a successfully resolved action', async function () {
        const reportedErrors: unknown[] = [];
        const fireAndForgetInvoker = createFireAndForgetInvoker({
            reportError(error: unknown) {
                reportedErrors.push(error);
            }
        });

        fireAndForgetInvoker.fireAndForget(async function () {
            return { result: 'ignored' };
        });

        await fireAndForgetInvoker.waitUntilAllSettled();
        assert.deepStrictEqual(reportedErrors, []);
    });

    test('reports a synchronous action failure', async function () {
        const expectedError = new Error('synchronous failure');
        const reportedErrors: unknown[] = [];
        const fireAndForgetInvoker = createFireAndForgetInvoker({
            reportError(error: unknown) {
                reportedErrors.push(error);
            }
        });

        fireAndForgetInvoker.fireAndForget(function () {
            throw expectedError;
        });

        await fireAndForgetInvoker.waitUntilAllSettled();
        assert.deepStrictEqual(reportedErrors, [ expectedError ]);
    });

    test('reports an asynchronously rejected action', async function () {
        const expectedError = new Error('asynchronous failure');
        const reportedErrors: unknown[] = [];
        const fireAndForgetInvoker = createFireAndForgetInvoker({
            reportError(error: unknown) {
                reportedErrors.push(error);
            }
        });

        fireAndForgetInvoker.fireAndForget(async function () {
            throw expectedError;
        });

        await fireAndForgetInvoker.waitUntilAllSettled();
        assert.deepStrictEqual(reportedErrors, [ expectedError ]);
    });

    test('waits for multiple outstanding actions independently', async function () {
        const firstActionCompletion = createDeferredPromise<undefined>();
        const secondActionCompletion = createDeferredPromise<undefined>();
        const fireAndForgetInvoker = createFireAndForgetInvoker({
            reportError() {
                throw new Error('reportError should not be called');
            }
        });

        fireAndForgetInvoker.fireAndForget(async function () {
            return firstActionCompletion.promise;
        });
        fireAndForgetInvoker.fireAndForget(async function () {
            return secondActionCompletion.promise;
        });
        const drainPromise = fireAndForgetInvoker.waitUntilAllSettled();
        const drainCompletionPromise = resolveTrueWhenPromiseSettles(drainPromise);

        firstActionCompletion.resolve(undefined);
        const actualDrainCompletionBeforeSecondActionResolution = await Promise.race([
            drainCompletionPromise,
            timers.setImmediate()
        ]);
        assert.strictEqual(actualDrainCompletionBeforeSecondActionResolution, undefined);

        secondActionCompletion.resolve(undefined);
        await drainPromise;
    });

    test('includes actions registered while draining', async function () {
        const firstActionCompletion = createDeferredPromise<undefined>();
        const secondActionCompletion = createDeferredPromise<undefined>();
        const firstActionError = new Error('first action failure');
        const reportedErrors: unknown[] = [];
        const firstErrorReport = createDeferredPromise<undefined>();

        const fireAndForgetInvoker: FireAndForgetInvoker = createFireAndForgetInvoker({
            reportError(error: unknown) {
                reportedErrors.push(error);
                if (error === firstActionError) {
                    fireAndForgetInvoker.fireAndForget(async function () {
                        return secondActionCompletion.promise;
                    });
                    firstErrorReport.resolve(undefined);
                }
            }
        });

        fireAndForgetInvoker.fireAndForget(async function () {
            return firstActionCompletion.promise;
        });
        const drainPromise = fireAndForgetInvoker.waitUntilAllSettled();
        firstActionCompletion.reject(firstActionError);
        await firstErrorReport.promise;

        const drainCompletionPromise = resolveTrueWhenPromiseSettles(drainPromise);
        const actualDrainCompletionBeforeSecondActionResolution = await Promise.race([
            drainCompletionPromise,
            timers.setImmediate()
        ]);
        assert.strictEqual(actualDrainCompletionBeforeSecondActionResolution, undefined);

        secondActionCompletion.resolve(undefined);
        await drainPromise;
        assert.deepStrictEqual(reportedErrors, [ firstActionError ]);
    });

    test('resolves repeated drain calls after all work has completed', async function () {
        const fireAndForgetInvoker = createFireAndForgetInvoker({
            reportError() {
                throw new Error('reportError should not be called');
            }
        });

        fireAndForgetInvoker.fireAndForget(async function () {
            return undefined;
        });

        await fireAndForgetInvoker.waitUntilAllSettled();
        await fireAndForgetInvoker.waitUntilAllSettled();
    });

    test('waits for an asynchronous error reporter', async function () {
        const expectedError = new Error('asynchronous failure');
        const reportedErrors: unknown[] = [];
        const reportStarted = createDeferredPromise<undefined>();
        const reportCompletion = createDeferredPromise<undefined>();
        const fireAndForgetInvoker = createFireAndForgetInvoker({
            async reportError(error: unknown) {
                reportedErrors.push(error);
                reportStarted.resolve(undefined);
                await reportCompletion.promise;
            }
        });

        fireAndForgetInvoker.fireAndForget(async function () {
            throw expectedError;
        });
        await reportStarted.promise;

        const drainPromise = fireAndForgetInvoker.waitUntilAllSettled();
        const drainCompletionPromise = resolveTrueWhenPromiseSettles(drainPromise);
        const actualDrainCompletionBeforeReporterResolution = await Promise.race([
            drainCompletionPromise,
            timers.setImmediate()
        ]);
        assert.strictEqual(actualDrainCompletionBeforeReporterResolution, undefined);

        reportCompletion.resolve(undefined);
        await drainPromise;
        assert.deepStrictEqual(reportedErrors, [ expectedError ]);
    });

    test('contains synchronous reporter failures without recursive reporting', async function () {
        const expectedActionError = new Error('action failure');
        const expectedReporterError = new Error('reporter failure');
        let reportInvocationCount = 0;
        const fireAndForgetInvoker = createFireAndForgetInvoker({
            reportError() {
                reportInvocationCount += 1;
                throw expectedReporterError;
            }
        });

        fireAndForgetInvoker.fireAndForget(function () {
            throw expectedActionError;
        });

        await fireAndForgetInvoker.waitUntilAllSettled();
        assert.strictEqual(reportInvocationCount, 1);
    });

    test('contains asynchronous reporter failures without unhandled rejections', async function () {
        const expectedActionError = new Error('action failure');
        const expectedReporterError = new Error('reporter failure');
        const unhandledRejectionReasons: unknown[] = [];
        function recordUnhandledRejection(reason: unknown): void {
            unhandledRejectionReasons.push(reason);
        }
        const fireAndForgetInvoker = createFireAndForgetInvoker({
            async reportError() {
                throw expectedReporterError;
            }
        });

        process.on('unhandledRejection', recordUnhandledRejection);
        try {
            fireAndForgetInvoker.fireAndForget(function () {
                throw expectedActionError;
            });
            fireAndForgetInvoker.fireAndForget(async function () {
                throw expectedActionError;
            });
            await fireAndForgetInvoker.waitUntilAllSettled();
            await timers.setImmediate();
        } finally {
            process.off('unhandledRejection', recordUnhandledRejection);
        }

        assert.deepStrictEqual(unhandledRejectionReasons, []);
    });

    test('handles multiple concurrent failures independently', async function () {
        const firstActionError = new Error('first action failure');
        const secondActionError = new Error('second action failure');
        const reportedErrors: unknown[] = [];
        const fireAndForgetInvoker = createFireAndForgetInvoker({
            reportError(error: unknown) {
                reportedErrors.push(error);
            }
        });

        fireAndForgetInvoker.fireAndForget(async function () {
            throw firstActionError;
        });
        fireAndForgetInvoker.fireAndForget(async function () {
            throw secondActionError;
        });

        await fireAndForgetInvoker.waitUntilAllSettled();
        assert.deepStrictEqual(reportedErrors, [ firstActionError, secondActionError ]);
    });
});
