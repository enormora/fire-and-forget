// @ts-check
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const executeFile = promisify(execFile);

const projectFolder = process.cwd();
const sourcesFolder = path.join(projectFolder, 'target/build/source');
const licensePath = path.join(projectFolder, 'LICENSE');
const readmePath = path.join(projectFolder, 'README.md');
const additionalFiles = [
    { inputFilePath: licensePath, targetFilePath: 'LICENSE' },
    { inputFilePath: readmePath, targetFilePath: 'README.md' }
];

const packageRoots = {
    main: {
        javaScript: 'index.js',
        declarationFile: 'index.d.ts'
    },
    fireAndForgetInvoker: {
        javaScript: 'fire-and-forget-invoker.js',
        declarationFile: 'fire-and-forget-invoker.d.ts'
    }
};

const packageInterface = {
    modules: [
        { root: 'main', export: '.' },
        { root: 'fireAndForgetInvoker', export: './fire-and-forget-invoker' }
    ]
};

const checks = {
    typeScriptIntegrity: { enabled: true, declarations: 'all' },
    noDuplicatedFiles: { enabled: true },
    requiredFiles: { enabled: true, files: [ 'LICENSE', 'README.md' ] },
    maximumBundleSize: { enabled: true, bytes: 100_000 },
    noUnusedBundleDependencies: { enabled: true },
    noDevelopmentDependencyImports: { enabled: true },
    uniqueTargetPaths: { enabled: true },
    noUnexposedExecutables: { enabled: true },
    nodeEngineCompatibility: { enabled: true },
    noSideEffects: { enabled: true }
};

/**
 * @param {string} packageName
 */
function createReleasePullRequestSettings(packageName) {
    return {
        branch: 'release/fire-and-forget',
        body: `Updates CHANGELOG.md for the next ${packageName} release.`,
        githubActionsContinuousIntegration: {
            trigger: 'workflow-dispatch',
            workflowFile: 'continuous-integration.yml',
            requiredStatusContexts: [
                'Tests with Node.js v24',
                'Tests with Node.js v26',
                'Release PR policy',
                'Workflow security analysis'
            ]
        },
        label: 'release',
        title: 'Prepare release'
    };
}

/**
 * @param {string} packageTags
 * @param {string} initialCommit
 * @returns {string | undefined}
 */
export function resolveChangelogBaseRef(packageTags, initialCommit) {
    return packageTags.trim() === '' ? initialCommit.trim() : undefined;
}

/**
 * @param {string | undefined} explicitBaseReference
 * @returns {NonNullable<import('@packtory/cli').PacktoryConfiguration['changelog']>}
 */
function createChangelogSettings(explicitBaseReference) {
    return {
        explicitBaseReference,
        packageTagFormat: '{packageName}@{version}',
        pullRequestLog: {
            ignoredLabels: [ 'release' ],
            collapseRules: [
                {
                    label: 'upgrade',
                    pattern: '^(?<prefix>⬆️ )?Update dependency (?<dependency>.+?) from (?<from>.+?) to (?<to>.+?)$',
                    replace: '$<prefix>Update dependency $<dependency> from $<from> to $<to>'
                },
                {
                    label: 'upgrade',
                    pattern: '^(?<prefix>⬆️ )?Update (?:dependency )?`?(?<dependency>.+?)`? to `?(?<to>[^` ]+)`?$',
                    replace: '$<prefix>Update dependency $<dependency> to $<to>',
                    versionGroup: 'to'
                },
                {
                    label: 'upgrade',
                    pattern: '^(?<prefix>⬆️ )?(?<dependency>Lock file maintenance|Update (?:.+ dependencies|eslint))$',
                    replace: '$<prefix>$<dependency>',
                    collapse: 'same'
                }
            ]
        },
        outputs: [ { kind: 'repository-file', path: 'CHANGELOG.md' }, { kind: 'github-release' } ]
    };
}

/**
 * @param {string} packageName
 * @returns {Promise<string | undefined>}
 */
async function readChangelogBaseRef(packageName) {
    const { stdout: packageTags } = await executeFile('git', [ 'tag', '--list', `${packageName}@*` ]);
    const { stdout: initialCommit } = await executeFile('git', [
        'rev-list',
        '--max-parents=0',
        '--first-parent',
        'HEAD'
    ]);
    return resolveChangelogBaseRef(packageTags, initialCommit);
}

/**
 * @returns {Promise<import('@packtory/cli').PacktoryConfiguration>}
 */
export async function buildConfiguration() {
    const packageJsonContent = await fs.readFile(path.join(projectFolder, 'package.json'), { encoding: 'utf8' });
    const packageJson = JSON.parse(packageJsonContent);
    return {
        registrySettings: {
            authentication: {
                publish: { type: 'npm-open-identity-connect', provider: 'github-actions' },
                metadata: 'automatic'
            }
        },
        changelog: createChangelogSettings(await readChangelogBaseRef(packageJson.name)),
        releasePullRequest: createReleasePullRequestSettings(packageJson.name),
        checks,
        commonPackageSettings: {
            sourcesFolder,
            mainPackageManifest: packageJson,
            includeSourceMapFiles: true,
            publishSettings: {
                access: 'public',
                provenance: { type: 'automatic' }
            },
            additionalPackageManifestAttributes: {
                description: packageJson.description,
                author: packageJson.author,
                license: packageJson.license,
                repository: packageJson.repository,
                bugs: packageJson.bugs,
                homepage: packageJson.homepage,
                engines: packageJson.engines,
                keywords: packageJson.keywords
            },
            additionalFiles
        },
        packages: [
            {
                name: packageJson.name,
                roots: packageRoots,
                packageInterface
            }
        ]
    };
}
