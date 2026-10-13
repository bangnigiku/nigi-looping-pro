import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import esbuild from 'esbuild';
import { createServer } from 'vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

async function startDev() {
  // 1. Build main and preload
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

  // 2. Start Vite server
  const server = await createServer({
    configFile: path.join(root, 'vite.config.ts'),
  });
  await server.listen();

  const address = server.httpServer?.address();
  const port = typeof address === 'object' && address ? address.port : 5173;
  const devUrl = `http://localhost:${port}`;
  console.log(`[dev] Vite dev server running at: ${devUrl}`);

  // 3. Launch Electron
  const electronBin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');

  const electronProcess = spawn(electronBin, ['.'], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      VITE_DEV_SERVER_URL: devUrl,
      ELECTRON_OPEN_DEVTOOLS: '1',
    },
  });

  electronProcess.on('close', () => {
    server.close();
    process.exit(0);
  });
}

startDev().catch((err) => {
  console.error(err);
  process.exit(1);
});
