import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

async function build() {
  console.log('[build-main] Bundling Main & Preload to CJS...');

  // Main process bundle
  await esbuild.build({
    entryPoints: [path.join(root, 'src/main/main.ts')],
    outfile: path.join(root, 'dist/main/main.cjs'),
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    external: ['electron', 'ffmpeg-static', 'ffprobe-static'],
    sourcemap: true,
  });

  // Preload bundle
  await esbuild.build({
    entryPoints: [path.join(root, 'src/preload/index.ts')],
    outfile: path.join(root, 'dist/preload/index.cjs'),
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    external: ['electron'],
    sourcemap: true,
  });

  console.log('[build-main] Done.');
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
