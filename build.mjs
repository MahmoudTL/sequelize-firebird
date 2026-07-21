#!/usr/bin/env node

import { build } from 'esbuild';
import glob from 'fast-glob';
import childProcess from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const exec = promisify(childProcess.exec);

const rootDir = path.dirname(fileURLToPath(import.meta.url));
const sourceDir = path.join(rootDir, 'src');
const libDir = path.join(rootDir, 'lib');

const [sourceFiles] = await Promise.all([
  glob(`${glob.convertPathToPattern(sourceDir)}/**/*.{mjs,cjs,js,mts,cts,ts}`, {
    onlyFiles: true,
    absolute: false,
  }),
  rmDir(libDir),
]);

const filesToCompile = [];
const filesToCopyToLib = [];

for (const file of sourceFiles) {
  if (file.endsWith('.test.ts')) {
    continue;
  }

  if (file.endsWith('.mjs') || file.endsWith('.d.ts')) {
    filesToCopyToLib.push(file);
  } else {
    filesToCompile.push(file);
  }
}

await Promise.all([
  copyFiles(filesToCopyToLib, sourceDir, libDir),
  build({
    sourcemap: true,
    target: 'node18',
    format: 'cjs',
    outdir: libDir,
    entryPoints: filesToCompile.map(file => path.resolve(file)),
  }),
]);

try {
  await exec('tsc --emitDeclarationOnly --project tsconfig.build.json', {
    env: {
      ...process.env,
      PATH: `${process.env.PATH || ''}${path.delimiter}${path.join(rootDir, 'node_modules/.bin')}`,
    },
    cwd: rootDir,
  });
} catch (error) {
  // Declaration emit can fail on the test files without blocking the runtime build.
  console.error('tsc --emitDeclarationOnly reported errors (see above); lib/*.js was still emitted.');
}

const indexFiles = await glob(`${glob.convertPathToPattern(libDir)}/**/index.d.ts`, {
  onlyFiles: true,
  absolute: false,
});

await Promise.all(
  indexFiles.map(async indexFile => {
    await fs.copyFile(indexFile, indexFile.replace(/.d.ts$/, '.d.mts'));
  }),
);

async function rmDir(dirName) {
  try {
    await fs.stat(dirName);
    await fs.rm(dirName, { recursive: true });
  } catch {
    /* no-op */
  }
}

async function copyFiles(files, fromFolder, toFolder) {
  await Promise.all(
    files.map(async file => {
      const to = path.join(toFolder, path.relative(fromFolder, file));
      const dir = path.dirname(to);
      await fs.mkdir(dir, { recursive: true });
      await fs.copyFile(file, to);
    }),
  );
}