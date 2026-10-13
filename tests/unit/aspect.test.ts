import { describe, expect, it } from 'vitest';
import {
  ratioLabel,
  resolveOutputSize,
  sanitizeSize,
  toEven,
  validateDimension,
} from '../../src/shared/aspect';
import { createEmptyProject } from '../../src/shared/project';

describe('aspect ratio system', () => {
  it('enforces even dimensions for YUV420p', () => {
    expect(toEven(1920)).toBe(1920);
    expect(toEven(1921)).toBe(1922);
  });

  it('validates safe dimensions', () => {
    expect(validateDimension(1920)).toBe(true);
    expect(validateDimension(1921)).toBe(false);
    expect(validateDimension(50)).toBe(false);
    expect(validateDimension(5000)).toBe(false);
  });

  it('formats aspect ratio labels', () => {
    expect(ratioLabel(1920, 1080)).toBe('16:9');
    expect(ratioLabel(1080, 1920)).toBe('9:16');
    expect(ratioLabel(1080, 1080)).toBe('1:1');
    expect(ratioLabel(1080, 1350)).toBe('4:5');
  });

  it('sanitizes sizes within max boundaries', () => {
    const s = sanitizeSize(8000, 4500);
    expect(s.width).toBeLessThanOrEqual(4096);
    expect(s.height).toBeLessThanOrEqual(4096);
    expect(s.width % 2).toBe(0);
    expect(s.height % 2).toBe(0);
  });

  it('resolves output dimensions for project presets', () => {
    const proj = createEmptyProject();
    proj.settings.aspect.preset = '16:9';
    expect(resolveOutputSize(proj)).toEqual({ width: 1920, height: 1080 });

    proj.settings.aspect.preset = '9:16';
    expect(resolveOutputSize(proj)).toEqual({ width: 1080, height: 1920 });

    proj.settings.aspect.preset = '1:1';
    expect(resolveOutputSize(proj)).toEqual({ width: 1080, height: 1080 });
  });
});
