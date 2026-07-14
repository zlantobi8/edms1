/**
 * One-time setup: downloads the COCO-SSD (lite_mobilenet_v2) object
 * detection model weights so the app can run phone/object detection
 * fully offline, with no runtime dependency on any external server.
 *
 * Run this ONCE, on a machine with internet access, before building:
 *   node scripts/download-coco-ssd-model.js
 *
 * It writes model.json + the shard .bin files into public/models/coco-ssd/.
 * Those files should then be committed to your repo (or downloaded as a
 * build step in CI) so the packaged app ships with them baked in — the
 * exam machine itself never needs internet access at runtime.
 */
const https = require('https');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/';
const OUT_DIR = path.join(__dirname, '..', 'public', 'models', 'coco-ssd');

function download(url, destPath) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to download ${url}: HTTP ${res.statusCode}`));
        return;
      }
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => file.close(resolve));
    }).on('error', reject);
  });
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  console.log('Downloading model.json ...');
  const modelJsonPath = path.join(OUT_DIR, 'model.json');
  await download(`${BASE_URL}model.json`, modelJsonPath);

  const manifest = JSON.parse(fs.readFileSync(modelJsonPath, 'utf8'));
  const shardPaths = (manifest.weightsManifest || [])
    .flatMap((group) => group.paths || []);

  if (!shardPaths.length) {
    throw new Error('model.json did not contain any weight shard paths — the model format may have changed.');
  }

  for (const shard of shardPaths) {
    console.log(`Downloading ${shard} ...`);
    // eslint-disable-next-line no-await-in-loop
    await download(`${BASE_URL}${shard}`, path.join(OUT_DIR, shard));
  }

  console.log(`\nDone. ${shardPaths.length + 1} files saved to ${OUT_DIR}`);
  console.log('Commit these files to your repo so CI ships them in the build.');
}

main().catch((err) => {
  console.error('Download failed:', err.message);
  process.exit(1);
});
