/* eslint-disable no-undef, @typescript-eslint/no-require-imports */
const { createHash } = require('node:crypto');
const { createReadStream } = require('node:fs');
const { readFile, stat, writeFile, rename } = require('node:fs/promises');
const path = require('node:path');
const yaml = require('js-yaml');

async function finalizeAppImageMetadata(directory = 'release') {
  const manifestPath = path.join(directory, 'latest-linux.yml');
  const manifest = yaml.load(await readFile(manifestPath, 'utf8'));
  if (!Array.isArray(manifest?.files)) {
    throw new Error('latest-linux.yml must contain a files array');
  }

  const images = manifest.files.filter(file => file.url?.endsWith('.AppImage'));
  if (images.length === 0) {
    throw new Error('latest-linux.yml must reference an AppImage');
  }
  for (const file of images) {
    const filename = decodeURIComponent(file.url);
    if (path.basename(filename) !== filename) {
      throw new Error(`Expected a local AppImage filename: ${file.url}`);
    }
    const imagePath = path.join(directory, filename);
    const hash = createHash('sha512');
    for await (const chunk of createReadStream(imagePath)) {
      hash.update(chunk);
    }
    file.sha512 = hash.digest('base64');
    file.size = (await stat(imagePath)).size;
    // appimagetool repacks SquashFS, not electron-builder's appended blockmap.
    // Advertising the old map would make differential downloads read invalid bytes.
    delete file.blockMapSize;
    if (manifest.path === file.url) {
      manifest.sha512 = file.sha512;
      if ('size' in manifest) manifest.size = file.size;
    }
  }
  delete manifest.blockMapSize;
  const temporaryPath = `${manifestPath}.tmp`;
  await writeFile(temporaryPath, yaml.dump(manifest));
  await rename(temporaryPath, manifestPath);
}

module.exports = { finalizeAppImageMetadata };

if (require.main === module) {
  finalizeAppImageMetadata(process.argv[2]).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
