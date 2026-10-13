import { firstVideoAsset } from './time';
import type { AspectPreset, ProjectDocument } from './types';

export const ASPECT_PRESETS: Record<Exclude<AspectPreset, 'source' | 'custom'>, { width: number; height: number }> = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '4:3': { width: 1440, height: 1080 },
  '3:2': { width: 1620, height: 1080 },
};

export const MIN_DIMENSION = 128;
export const MAX_DIMENSION = 4096;
export const FALLBACK_SIZE = { width: 1920, height: 1080 };

/** H.264 with yuv420p requires even dimensions. */
export function toEven(n: number): number {
  const r = Math.round(n);
  return r % 2 === 0 ? r : r + 1;
}

export function validateDimension(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_DIMENSION && n <= MAX_DIMENSION && n % 2 === 0;
}

/** Scales a size down (preserving ratio) so both sides fit within MAX_DIMENSION, then makes it even. */
export function sanitizeSize(width: number, height: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { ...FALLBACK_SIZE };
  const scale = Math.min(1, MAX_DIMENSION / width, MAX_DIMENSION / height);
  let w = toEven(width * scale);
  let h = toEven(height * scale);
  if (w < MIN_DIMENSION || h < MIN_DIMENSION) {
    const up = Math.max(MIN_DIMENSION / w, MIN_DIMENSION / h);
    w = toEven(w * up);
    h = toEven(h * up);
  }
  return { width: Math.min(w, MAX_DIMENSION), height: Math.min(h, MAX_DIMENSION) };
}

/** Resolves the output canvas size for the project. */
export function resolveOutputSize(project: ProjectDocument): { width: number; height: number } {
  const a = project.settings.aspect;
  if (a.preset === 'source') {
    const v = firstVideoAsset(project);
    const w = v?.metadata.displayWidth ?? v?.metadata.width;
    const h = v?.metadata.displayHeight ?? v?.metadata.height;
    if (w && h) return sanitizeSize(w, h);
    return { ...FALLBACK_SIZE };
  }
  if (a.preset === 'custom') {
    if (validateDimension(a.width) && validateDimension(a.height)) return { width: a.width, height: a.height };
    return sanitizeSize(a.width, a.height);
  }
  return { ...ASPECT_PRESETS[a.preset] };
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** "16:9" style label for any size. */
export function ratioLabel(width: number, height: number): string {
  if (!(width > 0 && height > 0)) return '-';
  const g = gcd(Math.round(width), Math.round(height));
  const rw = Math.round(width) / g;
  const rh = Math.round(height) / g;
  if (rw <= 64 && rh <= 64) return `${rw}:${rh}`;
  return `${(width / height).toFixed(2)}:1`;
}

export function isValidHexColor(c: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(c);
}
