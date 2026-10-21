// @vitest-environment node
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

describe.each(['chokidar', 'micromatch'])('%s braces override', consumer => {
  const consumerRequire = createRequire(require.resolve(consumer));
  const braces = consumerRequire('braces');

  it('resolves the pinned depth-guard fork', () => {
    expect(consumerRequire('braces/package.json')).toMatchObject({
      name: '@dieub/braces-depth-guard',
      version: '3.0.3-pn.3'
    });
  });

  it('preserves nested alternatives, padded ranges, and escaped braces', () => {
    expect(braces.expand('src/{main,{preload,renderer}}/*.{ts,tsx}')).toEqual([
      'src/main/*.ts',
      'src/main/*.tsx',
      'src/preload/*.ts',
      'src/preload/*.tsx',
      'src/renderer/*.ts',
      'src/renderer/*.tsx'
    ]);
    expect(braces.expand('file-{01..03}.ts')).toEqual(['file-01.ts', 'file-02.ts', 'file-03.ts']);
    expect(braces.expand('file-\\{a,b\\}.ts')).toEqual(['file-{a,b}.ts']);
  });

  it.each(['{', '('])('allows 100 nested %s groups and explicitly rejects 101', open => {
    const close = open === '{' ? '}' : ')';
    for (const method of ['parse', 'compile', 'expand', 'stringify']) {
      expect(() => braces[method](open.repeat(100) + 'x' + close.repeat(100))).not.toThrow();
      expect(() => braces[method](open.repeat(101) + 'x' + close.repeat(101))).toThrow(/exceeds max depth \(100\)/);
      expect(() => braces[method](open.repeat(4000) + 'x' + close.repeat(4000))).toThrow(/exceeds max depth \(100\)/);
    }
  });

  it('guards caller-supplied ASTs as well as parsed strings', () => {
    interface AstNode {
      type: string;
      nodes: AstNode[];
    }
    let node: AstNode = { type: 'root', nodes: [] };
    for (let depth = 0; depth < 102; depth++) {
      node = { type: 'root', nodes: [node] };
    }
    for (const method of ['compile', 'expand', 'stringify']) {
      expect(() => braces[method](node)).toThrow(/exceeds max depth \(100\)/);
    }
  });
});

it('preserves micromatch inclusion and exclusion patterns', () => {
  const micromatch = require('micromatch');
  expect(
    micromatch(
      ['src/main.ts', 'src/main.spec.ts', 'src/view.tsx', 'src/data.json'],
      ['src/*.{ts,tsx}', '!**/*.spec.ts']
    )
  ).toEqual(['src/main.ts', 'src/view.tsx']);
});

it('preserves chokidar brace-glob file watching', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'invoice-builder-glob-'));
  const chokidar = require('chokidar');
  const watcher = chokidar.watch(path.join(directory, '*.{ts,tsx}'), { ignoreInitial: true });
  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('File watcher timed out')), 5000);
      watcher.on('error', (error: Error) => {
        clearTimeout(timeout);
        reject(error);
      });
      watcher.on('add', (filename: string) => {
        clearTimeout(timeout);
        expect(path.basename(filename)).toBe('example.tsx');
        resolve();
      });
      watcher.on('ready', () => {
        writeFile(path.join(directory, 'example.tsx'), 'export {};').catch(reject);
      });
    });
  } finally {
    await watcher.close();
    await rm(directory, { recursive: true, force: true });
  }
});
