# @enormora/fire-and-forget

Run asynchronous actions without awaiting them and report failures through an injected callback.

## Install

```sh
npm install @enormora/fire-and-forget
```

ESM only. Supports Node.js `^24.15.0 || ^26.0.0`. No runtime dependencies.

## Usage

```ts
import { createFireAndForgetInvoker } from '@enormora/fire-and-forget';

const invoker = createFireAndForgetInvoker({
    reportError(error) {
        applicationLogger.error('background action failed', error);
    }
});

invoker.fireAndForget(async function () {
    await sendTelemetry();
});
```

`fireAndForget()` starts the action immediately and returns `void`. Synchronous throws and rejected promises go to `reportError`; reporter failures are contained. The reporter is application code, so the package has no logging or observability dependency. Return or await work inside the callback for it to be observed.

## Waiting for outstanding work

```ts
await invoker.waitUntilAllSettled();
```

This waits for tracked actions and their reporter promises, including work registered while draining, until the tracked set is empty. Use it during shutdown or in tests.

## API

```ts
export type FireAndForgetErrorReporter = (
    error: unknown
) => void | Promise<void>;

export type FireAndForgetInvokerDependencies = {
    readonly reportError: FireAndForgetErrorReporter;
};

export type FireAndForgetInvoker = {
    readonly fireAndForget: (asyncAction: () => Promise<unknown>) => void;
    readonly waitUntilAllSettled: () => Promise<void>;
};

export function createFireAndForgetInvoker(
    dependencies: FireAndForgetInvokerDependencies
): FireAndForgetInvoker;
```

The same API is exported from `@enormora/fire-and-forget/fire-and-forget-invoker`.
