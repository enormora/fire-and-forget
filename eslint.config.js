import { baseConfig } from '@enormora/eslint-config-base';
import { mochaNodeAssertConfig } from '@enormora/eslint-config-mocha-node-assert';
import { nodeConfig, nodeConfigFileConfig } from '@enormora/eslint-config-node';
import { typescriptConfig } from '@enormora/eslint-config-typescript';

export default [
    {
        ignores: [ '**/CHANGELOG.md', 'target/**' ]
    },
    ...baseConfig,
    {
        files: [ '**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx,vue}' ],
        rules: {
            'import/no-unused-modules': [
                'error',
                {
                    unusedExports: true,
                    suppressMissingFileEnumeratorAPIWarning: true
                }
            ]
        }
    },
    {
        ...nodeConfig,
        files: [ '**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx,vue}' ]
    },
    {
        ...typescriptConfig,
        files: [ '**/*.ts' ],
        rules: {
            ...typescriptConfig.rules,
            'import/extensions': [
                'error',
                'always',
                {
                    ignorePackages: true
                }
            ]
        }
    },
    {
        ...mochaNodeAssertConfig,
        files: [ '**/*.test.ts' ]
    },
    {
        files: [ '**/*.{js,cjs,mjs,jsx,ts,cts,mts,tsx,vue}' ],
        rules: {
            'max-lines-per-function': [ 'error', { max: 50, skipBlankLines: true, skipComments: true } ]
        }
    },
    {
        ...nodeConfigFileConfig,
        files: [ 'eslint.config.js', 'mocha.config.json', 'packtory.config.js' ]
    }
];
