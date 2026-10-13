import type { FrameRateChoice, MediaAsset, ProjectDocument, Rational } from './types';

export const FRAME_RATE_CHOICES: Record<Exclude<FrameRateChoice, 'source'>, Rational> = {
  '23.976': { num: 24000, den: 1001 },
  '24': { num: 24, den: 1 },
  '25': { num: 25, den: 1 },
  '29.97': { num: 30000, den: 1001 },
  '30': { num: 30, den: 1 },
  '50': { num: 50, den: 1 },
  '60': { num: 60, den: 1 },
};

export const DEFAULT_FPS: Rational = { num: 30, den: 1 };

export function fpsToNumber(r: Rational): number {
  return r.num / r.den;
}

export function rationalToString(r: Rational): string {
  return `${r.num}/${r.den}`;
}

/** Parses ffprobe style "30000/1001" strings. Returns undefined for invalid / zero rates. */
export function parseRational(value: string | undefined | null): Rational | undefined {
  if (!value) return undefined;
  const [n, d] = value.split('/');
  const num = Number(n);
  const den = d === undefined ? 1 : Number(d);
  if (!Number.isFinite(num) || !Number.isFinite(den) || num <= 0 || den <= 0) return undefined;
  return { num, den };
}

/** Normalises odd source rates to a sane value supported by the export pipeline. */
export function sanitizeFps(r: Rational | undefined): Rational {
  if (!r) return DEFAULT_FPS;
  const v = fpsToNumber(r);
  if (!Number.isFinite(v) || v < 1 || v > 120) return DEFAULT_FPS;
  // Snap near-standard rates to exact rationals.
  for (const std of Object.values(FRAME_RATE_CHOICES)) {
    if (Math.abs(fpsToNumber(std) - v) < 0.01) return std;
  }
  return { num: Math.round(v * 1000), den: 1000 };
}

/** Resolves the project output frame rate. */
export function resolveProjectFps(project: ProjectDocument): Rational {
  const choice = project.settings.frameRate;
  if (choice !== 'source') return FRAME_RATE_CHOICES[choice];
  const firstVideo = firstVideoAsset(project);
  return sanitizeFps(firstVideo?.metadata.frameRate);
}

export function firstVideoAsset(project: ProjectDocument): MediaAsset | undefined {
  const videoTrackIds = new Set(project.tracks.filter((t) => t.kind === 'video').map((t) => t.id));
  const clips = project.clips
    .filter((c) => videoTrackIds.has(c.trackId))
    .sort((a, b) => a.startMs - b.startMs);
  for (const c of clips) {
    const a = project.assets.find((x) => x.id === c.assetId);
    if (a?.metadata.hasVideo) return a;
  }
  return project.assets.find((a) => a.metadata.hasVideo);
}

/** Number of whole frames closest to a millisecond duration. */
export function msToFrames(ms: number, fps: Rational): number {
  return Math.round((ms / 1000) * fpsToNumber(fps));
}

export function framesToMs(frames: number, fps: Rational): number {
  return (frames * 1000 * fps.den) / fps.num;
}

/** Quantises a millisecond duration to the nearest frame boundary (returns ms, may be fractional). */
export function quantizeMs(ms: number, fps: Rational): number {
  return framesToMs(msToFrames(ms, fps), fps);
}

/** Returns the exact duration of a single frame in milliseconds. */
export function frameDurationMs(fps: Rational): number {
  return (1000 * fps.den) / fps.num;
}

/**
 * Steps forward or backward by an exact integer number of frames.
 * Uses integer frame index arithmetic to prevent floating-point accumulation errors.
 */
export function stepByFrames(currentMs: number, fps: Rational, deltaFrames: number, maxMs?: number): number {
  const currentFrame = msToFrames(currentMs, fps);
  const nextFrame = Math.max(0, currentFrame + deltaFrames);
  const nextMs = Math.round(framesToMs(nextFrame, fps));
  if (maxMs !== undefined) {
    return Math.min(maxMs, Math.max(0, nextMs));
  }
  return Math.max(0, nextMs);
}

/** Seconds string with microsecond precision for FFmpeg arguments. */
export function secArg(ms: number): string {
  const s = Math.max(0, ms) / 1000;
  return s.toFixed(6).replace(/\.?0+$/, '') || '0';
}

function pad(n: number, w = 2): string {
  return String(Math.floor(n)).padStart(w, '0');
}

/** HH:MM:SS:FF timecode. */
export function formatTimecode(ms: number, fps: Rational = DEFAULT_FPS): string {
  const safe = Math.max(0, ms);
  const fpsInt = Math.max(1, Math.round(fpsToNumber(fps)));
  const totalSeconds = Math.floor(safe / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const f = Math.min(fpsInt - 1, Math.floor(((safe % 1000) / 1000) * fpsInt));
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`;
}

/** Compact M:SS.t or H:MM:SS display. */
export function formatDuration(ms: number): string {
  const safe = Math.max(0, Math.round(ms));
  const totalSeconds = Math.floor(safe / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const tenths = Math.floor((safe % 1000) / 100);
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}.${tenths}`;
}

/** Parses "SS", "MM:SS", "HH:MM:SS" with optional decimals into ms. Returns null if invalid. */
export function parseDurationInput(text: string): number | null {
  const trimmed = text.trim().replace(',', '.');
  if (!trimmed) return null;
  const parts = trimmed.split(':');
  if (parts.length > 3) return null;
  let total = 0;
  for (const part of parts) {
    if (!/^\d+(\.\d+)?$/.test(part)) return null;
    total = total * 60 + Number(part);
  }
  if (!Number.isFinite(total)) return null;
  return Math.round(total * 1000);
}

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
