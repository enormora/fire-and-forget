# @enormora/fire-and-forget

Safe, testable fire-and-forget task execution for TypeScript with injectable error handling and zero runtime dependencies.

`void somePromise()` discards a promise from the caller's perspective. It does not observe a rejection. Intentionally detached work still needs an owner for failures and outstanding operations.

This package makes that ownership explicit. The application injects failure reporting; the invoker observes failures and tracks work until it settles. It has no opinion about logging or observability technology.

## Install

```sh
npm install @enormora/fire-and-forget
```

ESM only. Supported Node.js versions are `^24.15.0 || ^26.0.0`. The runtime uses standard ECMAScript promises and sets, with no Node.js or browser APIs, so it also works in modern browsers, Electron, and workers. There are zero runtime dependencies.

## Basic usage

```ts
import { createFireAndForgetInvoker } from '@enormora/fire-and-forget';

const invoker = createFireAndForgetInvoker({
    reportError(error) {
        // Application-specific reporting.
    }
});

invoker.fireAndForget(async function () {
    await sendTelemetry();
});
```

The callback runs immediately and exactly once. `fireAndForget()` returns `undefined` without awaiting completion. It observes synchronous throws and asynchronous rejections, and ignores successful result values. Synchronous work inside the callback still runs on the caller's thread.

Return or await the work inside the callback so the invoker can observe it.

## Application-owned adapters

A browser or application logger stays at the application boundary:

```ts
const invoker = createFireAndForgetInvoker({
    reportError(error) {
        applicationLogger.error('background action failed', error);
    }
});
```

The same boundary can adapt an observability SDK. These are consumer examples; `datadogRum` and `sentry` are supplied by the application and are not package dependencies:

```ts
const telemetryInvoker = createFireAndForgetInvoker({
    reportError(error) {
        datadogRum.addError(error);
    }
});

const monitoringInvoker = createFireAndForgetInvoker({
    reportError(error) {
        sentry.captureException(error);
    }
});
```

Reporters may return `Promise<void>`. The invoker waits for that promise as part of observing the failed action. If a reporter throws or rejects, its failure is intentionally contained and discarded. There is no fallback logger or recursive reporting. Applications that need a fallback must implement it inside their reporter.

## Drain outstanding work

```ts
await invoker.waitUntilAllSettled();
```

Use the drain at shutdown, lifecycle boundaries, and in deterministic tests. Most application code should simply call `fireAndForget()` without waiting for individual actions.

The drain waits for tracked actions **and their error reporters**. It checks again after each batch, including work registered while the drain is pending, until tracking is empty. Completed work is removed. Empty, repeated, and concurrent drain calls are supported; the invoker can accept more work after a drain.

The empty check is the completion boundary. Work registered after the drain promise resolves belongs to a later drain, even if it is registered before your `await` continuation runs. Stop producers before draining during shutdown. A never-settling action or reporter, or continuous production of new work, can keep the drain pending. An action or reporter must not await its own invoker's drain, which would wait on itself.

## API

```ts
export type FireAndForgetErrorReporter = (error: unknown) => void | Promise<void>;

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

The same API is available from `@enormora/fire-and-forget/fire-and-forget-invoker`.

## Development

Use the Node version in `.node-version`, then `npm clean-install`. Dependencies are pinned and updated through the shared Enormora Renovate presets.

| Command                                   | Purpose                                                                    |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| `just compile`                            | Strict TypeScript compilation and declarations                             |
| `just lint` / `just lint-fix`             | Shared Enormora ESLint rules, zero warnings                                |
| `just test-unit`                          | Mocha TDD tests with `node:assert`                                         |
| `just test-unit-coverage`                 | Tests with 100% coverage thresholds                                        |
| `just packtory-dry-run`                   | Registry-aware package validation and publish preview                      |
| `just packtory-preview`                   | Packtory tarball at `target/fire-and-forget.tgz` (preview version `0.0.0`) |
| `just test`                               | Compilation, lint, coverage, and Packtory dry run                          |
| `just release-plan` / `just release-diff` | Inspect the next Packtory release                                          |
| `just changelog`                          | Preview the generated changelog                                            |
| `just prepare-release`                    | Maintain the Packtory release pull request                                 |
| `just publish-release`                    | Publish, tag, push, and create the GitHub release (publish workflow)       |

## Releases

The npm package was bootstrapped with `@packtory/bootstrap-npm-package`. npm Trusted Publishing is configured once for the `Publish Release` workflow; the repository does not store an npm token.

Run the **Release** workflow and Packtory will maintain the `release/fire-and-forget` pull request, generate its changelog, and apply the `release` label. CI validates the release PR before it can merge. Merging a valid release PR authorizes **Publish Release**, where Packtory publishes publicly through npm OIDC with provenance and creates the package tag and GitHub Release. Packtory determines release versions from registry state and package changes.

Changelog entries come from merged, labeled pull requests. Before the first package tag exists, the configuration uses the repository's initial commit as the changelog baseline; subsequent releases use Packtory's package-tag resolution. Direct commits do not create changelog entries.

`packtory-preview` produces an inspectable tarball of the library files. Packtory's neutral `0.0.0` default keeps this synthetic preview version independent of the npm release version. The publish pipeline also generates `sbom.cdx.json`; `just release-diff` shows the full publish file list, including that SBOM.

The trusted publisher uses owner **enormora**, repository **fire-and-forget**, and workflow **publish-release.yml**, with publishing enabled and no environment restriction. Repository Actions must be allowed to create pull requests.
