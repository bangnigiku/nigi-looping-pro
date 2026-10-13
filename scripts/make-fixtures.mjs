import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const fixturesDir = path.join(root, 'tests', 'fixtures');

if (!fs.existsSync(fixturesDir)) {
  fs.mkdirSync(fixturesDir, { recursive: true });
}

const ffmpegExe = path.join(root, 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');

console.log('[make-fixtures] Generating test media fixtures using:', ffmpegExe);

// 1. MP4 with spaces in filename (5s, 1280x720, 30fps with 440Hz beep)
const fileWithSpaces = path.join(fixturesDir, 'sample with spaces.mp4');
spawnSync(
  ffmpegExe,
  [
    '-y',
    '-f', 'lavfi', '-i', 'testsrc=duration=5:size=1280x720:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=5',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    fileWithSpaces,
  ],
  { stdio: 'inherit' }
);

// 2. Short seamless test clip (4s, 1920x1080, 30fps)
const shortLoop = path.join(fixturesDir, 'short_loop.mp4');
spawnSync(
  ffmpegExe,
  [
    '-y',
    '-f', 'lavfi', '-i', 'testsrc=duration=4:size=1920x1080:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=523:duration=4',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    shortLoop,
  ],
  { stdio: 'inherit' }
);

// 3. Audio only MP3
const audioOnly = path.join(fixturesDir, 'ambient_audio.mp3');
spawnSync(
  ffmpegExe,
  [
    '-y',
    '-f', 'lavfi', '-i', 'sine=frequency=330:duration=6',
    '-c:a', 'libmp3lame',
    audioOnly,
  ],
  { stdio: 'inherit' }
);

console.log('[make-fixtures] Fixtures created successfully at:', fixturesDir);
