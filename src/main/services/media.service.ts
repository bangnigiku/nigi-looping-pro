import fs from 'node:fs';
import path from 'node:path';
import { app, dialog } from 'electron';
import type { ImportResult, MediaAsset, ProxyJobUpdate } from '../../shared/types';
import { spawnFfmpeg } from './ffmpeg.service';
import { probeMedia } from './ffprobe.service';
import { logDiagnostic } from './diagnostic.service';

export function getTempDirectory(): string {
  const dir = path.join(app.getPath('temp'), 'nigi-loping-pro');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function encodeMediaUrl(filePath: string): string {
  // Use robust query parameter format: nigi-media://load?path=<encoded-path>
  return `nigi-media://load?path=${encodeURIComponent(filePath)}`;
}

export async function openMediaFilesDialog(): Promise<string[]> {
  const res = await dialog.showOpenDialog({
    title: 'Pilih Berkas Media',
    properties: ['openFile', 'multiSelections'],
    filters: [
      {
        name: 'Berkas Media (Video & Audio)',
        extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'mp3', 'wav', 'aac', 'flac', 'm4a', 'ogg'],
      },
      { name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'avi', 'webm', 'ts', 'm4v'] },
      { name: 'Audio', extensions: ['mp3', 'wav', 'aac', 'flac', 'm4a', 'ogg'] },
      { name: 'Semua Berkas', extensions: ['*'] },
    ],
  });

  if (res.canceled || !res.filePaths.length) {
    return [];
  }
  return res.filePaths;
}

export async function inspectAndImportFile(filePath: string): Promise<ImportResult> {
  try {
    if (!fs.existsSync(filePath)) {
      return {
        path: filePath,
        ok: false,
        errorCode: 'FILE_NOT_FOUND',
        errorDetail: 'Berkas tidak ditemukan di lokasi penyimpanan.',
      };
    }

    const metadata = await probeMedia(filePath);
    const parsedName = path.basename(filePath);
    const kind = metadata.hasVideo ? 'video' : 'audio';

    logDiagnostic('MEDIA_INSPECTED', {
      filePath,
      hasVideo: metadata.hasVideo,
      videoCodec: metadata.videoCodec,
      audioCodec: metadata.audioCodec,
      previewLikelyUnsupported: metadata.previewLikelyUnsupported,
      durationMs: metadata.durationMs,
      resolution: `${metadata.width}x${metadata.height}`,
    });

    const partialAsset: Omit<MediaAsset, 'id' | 'importedAt'> = {
      path: filePath,
      name: parsedName,
      kind,
      metadata,
    };

    const previewUrl = encodeMediaUrl(filePath);

    return {
      path: filePath,
      ok: true,
      asset: partialAsset,
      previewUrl,
    };
  } catch (err: unknown) {
    const errorDetail = err instanceof Error ? err.message : String(err);
    logDiagnostic('MEDIA_INSPECT_ERROR', {
      filePath,
      errorDetail,
    });
    return {
      path: filePath,
      ok: false,
      errorCode: 'PROBE_FAILED',
      errorDetail,
    };
  }
}

/**
 * Creates an H.264 proxy if a media file cannot be rendered natively in Chromium.
 */
export function generatePreviewProxy(
  filePath: string,
  onProgress: (update: ProxyJobUpdate) => void
): Promise<string> {
  return new Promise((resolve, reject) => {
    const tempDir = getTempDirectory();
    const hash = Buffer.from(filePath).toString('base64url').slice(0, 16);
    const proxyPath = path.join(tempDir, `proxy_${hash}.mp4`);

    if (fs.existsSync(proxyPath)) {
      logDiagnostic('PROXY_CACHE_HIT', { filePath, proxyPath });
      onProgress({
        assetPath: filePath,
        state: 'completed',
        progress: 1,
        proxyPath,
        previewUrl: encodeMediaUrl(proxyPath),
      });
      resolve(proxyPath);
      return;
    }

    logDiagnostic('PROXY_GENERATION_START', { filePath, proxyPath });

    onProgress({
      assetPath: filePath,
      state: 'running',
      progress: 0,
    });

    const args = [
      '-hide_banner',
      '-y',
      '-i', filePath,
      '-vf', 'scale=-2:720',
      '-c:v', 'libx264',
      '-preset', 'ultrafast',
      '-crf', '28',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '128k',
      '-movflags', '+faststart',
      proxyPath,
    ];

    const proc = spawnFfmpeg(args);
    proc.stdout?.resume();
    let stderr = '';

    proc.stderr?.on('data', (d) => {
      stderr += d.toString();
    });

    proc.on('error', (err) => {
      logDiagnostic('PROXY_GENERATION_ERROR', { filePath, error: err.message });
      onProgress({
        assetPath: filePath,
        state: 'failed',
        progress: null,
        errorCode: err.message,
      });
      reject(err);
    });

    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(proxyPath)) {
        logDiagnostic('PROXY_GENERATION_SUCCESS', { filePath, proxyPath });
        onProgress({
          assetPath: filePath,
          state: 'completed',
          progress: 1,
          proxyPath,
          previewUrl: encodeMediaUrl(proxyPath),
        });
        resolve(proxyPath);
      } else {
        const err = new Error(`Proxy generation failed with code ${code}: ${stderr}`);
        logDiagnostic('PROXY_GENERATION_FAILED', { filePath, code, stderr });
        onProgress({
          assetPath: filePath,
          state: 'failed',
          progress: null,
          errorCode: err.message,
        });
        reject(err);
      }
    });
  });
}
