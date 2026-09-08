export type FireAndForgetErrorReporter = (error: unknown) => Promise<void> | void;

export type FireAndForgetInvokerDependencies = {
    readonly reportError: FireAndForgetErrorReporter;
};

export type FireAndForgetInvoker = {
    readonly fireAndForget: (asyncAction: () => Promise<unknown>) => void;
    readonly waitUntilAllSettled: () => Promise<void>;
};

export function createFireAndForgetInvoker(
    dependencies: FireAndForgetInvokerDependencies
): FireAndForgetInvoker {
    const activeObservationPromises = new Set<Promise<void>>();

    async function safelyReportError(error: unknown): Promise<void> {
        try {
            await dependencies.reportError(error);
        } catch {
            // There is no generic fallback for a reporter that fails.
        }
    }

    async function observeAction(asyncAction: () => Promise<unknown>): Promise<void> {
        try {
            await asyncAction();
        } catch (error: unknown) {
            await safelyReportError(error);
        }
    }

    async function removeSettledObservation(observationPromise: Promise<void>): Promise<void> {
        await observationPromise;
        activeObservationPromises.delete(observationPromise);
    }

    function fireAndForget(asyncAction: () => Promise<unknown>): void {
        const observationPromise = observeAction(asyncAction);
        activeObservationPromises.add(observationPromise);
        void removeSettledObservation(observationPromise);
    }

    async function waitUntilAllSettled(): Promise<void> {
        while (activeObservationPromises.size > 0) {
            await Promise.allSettled(Array.from(activeObservationPromises));
        }
    }

    return {
        fireAndForget,
        waitUntilAllSettled
    };
}
