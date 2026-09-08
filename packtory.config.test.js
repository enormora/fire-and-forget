import assert from 'node:assert';
import { suite, test } from 'mocha';

import { resolveChangelogBaseRef } from './packtory.config.js';

suite('initial release changelog', function () {
    test('uses the initial commit before any package release tag exists', function () {
        const actualBaseRef = resolveChangelogBaseRef('\n', 'initial-commit\n');
        assert.strictEqual(actualBaseRef, 'initial-commit');
    });

    test('lets Packtory resolve the previous release once package tags exist', function () {
        const actualBaseRef = resolveChangelogBaseRef('package@0.0.1\n', 'initial-commit\n');
        assert.strictEqual(actualBaseRef, undefined);
    });
});
