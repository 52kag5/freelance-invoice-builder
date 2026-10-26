/* eslint-disable no-undef, @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { mkdtemp, readFile, writeFile, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const yaml = require('js-yaml');
const { finalizeAppImageMetadata } = require('../finalize-appimage-metadata.cjs');

test('final manifest describes repacked bytes and never advertises the discarded blockmap', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'updater-metadata-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filename = 'Invoice-Builder-3.2.1.AppImage';
  const manifestPath = path.join(directory, 'latest-linux.yml');
  const original = {
    version: '3.2.1',
    files: [
      { url: filename, sha512: 'stale', size: 123, blockMapSize: 456 },
      { url: 'invoice.deb', sha512: 'unchanged', size: 789 }
    ],
    path: filename,
    sha512: 'stale',
    size: 123,
    blockMapSize: 456,
    releaseDate: '2026-10-26T00:00:00.000Z'
  };
  await writeFile(manifestPath, yaml.dump(original));
  const finalBytes = Buffer.from('repacked AppImage with zsync update information, without an embedded blockmap');
  await writeFile(path.join(directory, filename), finalBytes);

  await finalizeAppImageMetadata(directory);
  const manifest = yaml.load(await readFile(manifestPath, 'utf8'));
  const hash = createHash('sha512').update(finalBytes).digest('base64');
  assert.deepEqual(manifest.files[0], { url: filename, sha512: hash, size: finalBytes.length });
  assert.equal(manifest.sha512, hash);
  assert.equal(manifest.size, finalBytes.length);
  assert.equal('blockMapSize' in manifest, false);
  assert.deepEqual(manifest.files[1], original.files[1]);
  assert.equal(manifest.version, original.version);
  assert.equal(manifest.releaseDate, original.releaseDate);
  const firstRun = await readFile(manifestPath, 'utf8');
  await finalizeAppImageMetadata(directory);
  assert.equal(await readFile(manifestPath, 'utf8'), firstRun);
});

test('missing images and malformed manifests fail rather than publish stale metadata', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'updater-metadata-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const manifestPath = path.join(directory, 'latest-linux.yml');
  await assert.rejects(finalizeAppImageMetadata(directory), /ENOENT/);
  for (const manifest of [
    { version: '3.2.1' },
    { files: [{ url: 'only.deb' }] },
    { files: [{ url: '../outside.AppImage' }] },
    { files: [{ url: 'missing.AppImage', sha512: 'stale', blockMapSize: 123 }] }
  ]) {
    const content = yaml.dump(manifest);
    await writeFile(manifestPath, content);
    await assert.rejects(finalizeAppImageMetadata(directory));
    assert.equal(await readFile(manifestPath, 'utf8'), content);
  }
});

test('release pipeline finalizes after repacking and includes macOS updater ZIPs in publishing', async () => {
  const root = path.resolve(__dirname, '../..');
  const script = await readFile(path.join(root, 'scripts/embed-appimage-update.sh'), 'utf8');
  assert.ok(script.lastIndexOf('node scripts/finalize-appimage-metadata.cjs') > script.lastIndexOf('done'));
  const config = yaml.load(await readFile(path.join(root, 'apps/desktop/electron-builder.yml'), 'utf8'));
  assert.ok(config.mac.target.includes('zip'));
  assert.ok(config.mac.target.includes('dmg'));
  const workflow = yaml.load(await readFile(path.join(root, '.github/workflows/release.yml'), 'utf8'));
  const upload = workflow.jobs.mac.steps.find(step => step.uses?.startsWith('actions/upload-artifact@'));
  for (const pattern of ['release/*.zip', 'release/*.blockmap', 'release/*.yml']) {
    assert.ok(upload.with.path.includes(pattern));
  }
});
