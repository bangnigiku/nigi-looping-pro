import fs from 'node:fs';
import { parseRational } from '../../shared/time';
import type { MediaMetadata, Rational } from '../../shared/types';
import { spawnFfprobe } from './ffmpeg.service';

interface FfprobeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  sample_aspect_ratio?: string;
  display_aspect_ratio?: string;
  pix_fmt?: string;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  duration?: string;
  sample_rate?: string;
  channels?: number;
  side_data_list?: Array<{ rotation?: number }>;
  tags?: Record<string, string>;
}

interface FfprobeFormat {
  format_name?: string;
  duration?: string;
  size?: string;
  tags?: Record<string, string>;
}

interface FfprobeOutput {
  streams?: FfprobeStream[];
  format?: FfprobeFormat;
}

export async function probeMedia(filePath: string): Promise<MediaMetadata> {
  const stat = await fs.promises.stat(filePath);
  const sizeBytes = stat.size;

  const rawJson = await runFfprobeJson([
    '-v', 'quiet',
    '-print_format', 'json',
    '-show_format',
    '-show_streams',
    filePath,
  ]);

  const parsed: FfprobeOutput = JSON.parse(rawJson);
  const streams = parsed.streams ?? [];
  const format = parsed.format ?? {};

  const videoStream = streams.find((s) => s.codec_type === 'video');
  const audioStream = streams.find((s) => s.codec_type === 'audio');

  const hasVideo = Boolean(videoStream);
  const hasAudio = Boolean(audioStream);

  // Duration extraction: prefer format duration, fallback to stream duration
  let durationSec = parseFloat(format.duration ?? '0');
  if (!Number.isFinite(durationSec) || durationSec <= 0) {
    if (videoStream?.duration) {
      durationSec = parseFloat(videoStream.duration);
    } else if (audioStream?.duration) {
      durationSec = parseFloat(audioStream.duration);
    }
  }
  const durationMs = Math.max(0, Math.round((Number.isFinite(durationSec) ? durationSec : 0) * 1000));

  let width = videoStream?.width;
  let height = videoStream?.height;
  let displayWidth = width;
  let displayHeight = height;
  let rotation: number | undefined;

  if (videoStream) {
    // Rotation tag check
    if (videoStream.side_data_list) {
      for (const sd of videoStream.side_data_list) {
        if (typeof sd.rotation === 'number') {
          rotation = sd.rotation;
          break;
        }
      }
    }
    if (rotation === undefined && videoStream.tags?.rotate) {
      rotation = parseInt(videoStream.tags.rotate, 10);
    }

    // SAR / DAR correction
    if (videoStream.sample_aspect_ratio && width && height) {
      const sar = parseRational(videoStream.sample_aspect_ratio);
      if (sar && sar.num > 0 && sar.den > 0 && sar.num !== sar.den) {
        displayWidth = Math.round(width * (sar.num / sar.den));
      }
    }

    // Rotation swapping if 90 or 270 degrees
    if (rotation === 90 || rotation === 270 || rotation === -90 || rotation === -270) {
      const tempW = displayWidth;
      displayWidth = displayHeight;
      displayHeight = tempW;
    }
  }

  let frameRate: Rational | undefined;
  if (videoStream?.r_frame_rate) {
    frameRate = parseRational(videoStream.r_frame_rate);
    if (!frameRate && videoStream.avg_frame_rate) {
      frameRate = parseRational(videoStream.avg_frame_rate);
    }
  }

  const videoCodec = videoStream?.codec_name;
  const audioCodec = audioStream?.codec_name;
  const pixelFormat = videoStream?.pix_fmt;
  const sampleRate = audioStream?.sample_rate ? parseInt(audioStream.sample_rate, 10) : undefined;
  const channels = audioStream?.channels;

  // Check if preview is likely unsupported natively in Chromium:
  // Chromium natively supports: h264, vp8, vp9, av1. Does not always support hevc/h265, prores, dnxhd, mpeg2, wmv, flv1.
  let previewLikelyUnsupported = false;
  if (hasVideo && videoCodec) {
    const vc = videoCodec.toLowerCase();
    const isSupportedWeb = ['h264', 'avc1', 'vp8', 'vp9', 'av1'].includes(vc);
    if (!isSupportedWeb) {
      previewLikelyUnsupported = true;
    }
  }

  return {
    durationMs,
    formatName: format.format_name ?? 'unknown',
    sizeBytes,
    hasVideo,
    hasAudio,
    width,
    height,
    displayWidth,
    displayHeight,
    rotation,
    frameRate,
    videoCodec,
    pixelFormat,
    audioCodec,
    sampleRate,
    channels,
    previewLikelyUnsupported,
  };
}

function runFfprobeJson(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    try {
      const proc = spawnFfprobe(args);
      let stdout = '';
      let stderr = '';

      proc.stdout?.on('data', (d) => {
        stdout += d.toString();
      });
      proc.stderr?.on('data', (d) => {
        stderr += d.toString();
      });

      proc.on('error', (err) => reject(err));
      proc.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`ffprobe exited with code ${code}: ${stderr}`));
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}
