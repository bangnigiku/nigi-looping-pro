import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import type { FfmpegStatus } from '../../shared/types';

function dynamicRequire(id: string): any {
  try {
    if (typeof require === 'function') {
      return require(id);
    }
  } catch {
    // ignore
  }
  try {
    const req = createRequire(typeof __filename !== 'undefined' ? __filename : process.cwd() + '/index.js');
    return req(id);
  } catch {
    return null;
  }
}

let cachedFfmpegPath: string | null = null;
let cachedFfprobePath: string | null = null;

function isAppPackaged(): boolean {
  try {
    const electron = dynamicRequire('electron');
    return Boolean(electron && typeof electron === 'object' && electron.app && electron.app.isPackaged);
  } catch {
    return false;
  }
}

function getAppRoot(): string {
  try {
    const electron = dynamicRequire('electron');
    if (electron && typeof electron === 'object' && electron.app && typeof electron.app.getAppPath === 'function') {
      return electron.app.getAppPath();
    }
  } catch {
    // ignore
  }
  return process.cwd();
}

export function getFfmpegPath(): string {
  if (cachedFfmpegPath && fs.existsSync(cachedFfmpegPath)) {
    return cachedFfmpegPath;
  }

  // 1. Packaged resources path
  if (isAppPackaged()) {
    const packagedPath = path.join(process.resourcesPath, 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
    if (fs.existsSync(packagedPath)) {
      cachedFfmpegPath = packagedPath;
      return packagedPath;
    }
  }

  // 2. npm ffmpeg-static path
  try {
    const ffmpegStatic = dynamicRequire('ffmpeg-static') as string;
    if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
      cachedFfmpegPath = ffmpegStatic;
      return ffmpegStatic;
    }
  } catch {
    // ignore
  }

  // Fallback to local node_modules
  const directPath = path.join(getAppRoot(), 'node_modules', 'ffmpeg-static', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  if (fs.existsSync(directPath)) {
    cachedFfmpegPath = directPath;
    return directPath;
  }

  return 'ffmpeg';
}

export function getFfprobePath(): string {
  if (cachedFfprobePath && fs.existsSync(cachedFfprobePath)) {
    return cachedFfprobePath;
  }

  // 1. Packaged resources path
  if (isAppPackaged()) {
    const packagedPath = path.join(process.resourcesPath, 'bin', process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe');
    if (fs.existsSync(packagedPath)) {
      cachedFfprobePath = packagedPath;
      return packagedPath;
    }
  }

  // 2. npm ffprobe-static path
  try {
    const ffprobeStatic = dynamicRequire('ffprobe-static') as { path?: string };
    if (ffprobeStatic && ffprobeStatic.path && fs.existsSync(ffprobeStatic.path)) {
      cachedFfprobePath = ffprobeStatic.path;
      return ffprobeStatic.path;
    }
  } catch {
    // ignore
  }

  // Fallback to local node_modules
  const directPath = path.join(
    getAppRoot(),
    'node_modules',
    'ffprobe-static',
    'bin',
    process.platform,
    process.arch,
    process.platform === 'win32' ? 'ffprobe.exe' : 'ffprobe'
  );
  if (fs.existsSync(directPath)) {
    cachedFfprobePath = directPath;
    return directPath;
  }

  return 'ffprobe';
}

export async function checkFfmpegStatus(): Promise<FfmpegStatus> {
  const ffmpegP = getFfmpegPath();
  const ffprobeP = getFfprobePath();

  const ffmpegExists = fs.existsSync(ffmpegP);
  const ffprobeExists = fs.existsSync(ffprobeP);

  if (!ffmpegExists || !ffprobeExists) {
    return {
      ok: false,
      ffmpegPath: ffmpegP,
      ffprobePath: ffprobeP,
      errorCode: 'BINARIES_NOT_FOUND',
    };
  }

  const [ffmpegVer, ffprobeVer] = await Promise.all([
    runVersionCheck(ffmpegP),
    runVersionCheck(ffprobeP),
  ]);

  return {
    ok: Boolean(ffmpegVer && ffprobeVer),
    ffmpegPath: ffmpegP,
    ffprobePath: ffprobeP,
    ffmpegVersion: ffmpegVer ?? undefined,
    ffprobeVersion: ffprobeVer ?? undefined,
    errorCode: ffmpegVer && ffprobeVer ? undefined : 'VERSION_CHECK_FAILED',
  };
}

function runVersionCheck(binaryPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const proc = spawn(binaryPath, ['-version'], { windowsHide: true });
      let output = '';
      proc.stdout.on('data', (d) => {
        output += d.toString();
      });
      proc.on('error', () => resolve(null));
      proc.on('close', (code) => {
        if (code === 0) {
          const firstLine = output.split('\n')[0]?.trim() ?? 'OK';
          resolve(firstLine);
        } else {
          resolve(null);
        }
      });
    } catch {
      resolve(null);
    }
  });
}

export function spawnFfmpeg(args: string[]): ChildProcess {
  const binary = getFfmpegPath();
  return spawn(binary, args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

export function spawnFfprobe(args: string[]): ChildProcess {
  const binary = getFfprobePath();
  return spawn(binary, args, {
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
