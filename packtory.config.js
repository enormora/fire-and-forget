// @ts-check
import fs from 'node:fs/promises';
import path from 'node:path';

const projectFolder = process.cwd();
const sourcesFolder = path.join(projectFolder, 'target/build/source');
const licensePath = path.join(projectFolder, 'LICENSE');
const readmePath = path.join(projectFolder, 'README.md');
const additionalFiles = [
    { sourceFilePath: licensePath, targetFilePath: 'LICENSE' },
    { sourceFilePath: readmePath, targetFilePath: 'README.md' }
];

const packageRoots = {
    main: {
        js: 'index.js',
        declarationFile: 'index.d.ts'
    },
    fireAndForgetInvoker: {
        js: 'fire-and-forget-invoker.js',
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
    typeScriptIntegrity: { enabled: true },
    noDuplicatedFiles: { enabled: true },
    requiredFiles: { enabled: true, files: [ 'LICENSE', 'README.md' ] },
    maxBundleSize: { enabled: true, bytes: 100_000 },
    noUnusedBundleDependencies: { enabled: true },
    noDevDependencyImports: { enabled: true },
    uniqueTargetPaths: { enabled: true }
};

/**
 * @returns {Promise<import('@packtory/cli').PacktoryConfig>}
 */
export async function buildConfig() {
    const packageJsonContent = await fs.readFile(path.join(projectFolder, 'package.json'), { encoding: 'utf8' });
    const packageJson = JSON.parse(packageJsonContent);
    return {
        registrySettings: {
            auth: {
                publish: { type: 'npm-oidc', provider: 'github-actions' },
                metadata: 'auto'
            }
        },
        changelog: {
            packageTagFormat: '{packageName}@{version}',
            outputs: [ { kind: 'repository-file', path: 'CHANGELOG.md' }, { kind: 'github-release' } ]
        },
        checks,
        commonPackageSettings: {
            sourcesFolder,
            mainPackageJson: packageJson,
            includeSourceMapFiles: true,
            publishSettings: {
                access: 'public',
                provenance: { type: 'auto' }
            },
            additionalPackageJsonAttributes: {
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
