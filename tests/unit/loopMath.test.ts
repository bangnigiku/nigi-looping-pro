import { describe, expect, it } from 'vitest';
import {
  chainedDurationMs,
  computeLoopMath,
  loopSegmentSequence,
} from '../../src/shared/loopMath';

describe('loop math', () => {
  const fps = { num: 30, den: 1 };

  it('calculates repetitions accounting for crossfade overlap', () => {
    // 10s clip (10,000ms), 1s crossfade (1,000ms), target 25s (25,000ms)
    // tile = 9s, repetition 1 adds 9s, etc:
    // n=1: 10s
    // n=2: 19s
    // n=3: 28s -> covers 25s!
    const res = computeLoopMath(
      10000,
      {
        targetDurationMs: 25000,
        videoCrossfadeMs: 1000,
        audioCrossfadeEnabled: true,
        audioCrossfadeMs: 1000,
      },
      fps,
      true
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.math.repetitions).toBe(3);
    expect(res.math.overlapFrames).toBe(30); // 1s at 30fps
    expect(res.math.tileFrames).toBe(270); // 9s at 30fps
  });

  it('rejects crossfade longer than half of source unit', () => {
    const res = computeLoopMath(
      4000,
      {
        targetDurationMs: 20000,
        videoCrossfadeMs: 2500, // > 2000ms half limit
        audioCrossfadeEnabled: false,
        audioCrossfadeMs: 0,
      },
      fps,
      false
    );

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error).toBe('overlap-too-long');
    }
  });

  it('generates correct segment sequence (head, tile, tail)', () => {
    const res = computeLoopMath(
      5000,
      {
        targetDurationMs: 17000,
        videoCrossfadeMs: 1000,
        audioCrossfadeEnabled: false,
        audioCrossfadeMs: 0,
      },
      fps,
      false
    );

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const seq = loopSegmentSequence(res.math);
    expect(seq[0]).toBe('head');
    expect(seq[seq.length - 1]).toBe('tail');
    expect(seq.includes('tile')).toBe(true);
  });

  it('computes exact chained duration formula', () => {
    // 3 repetitions of 10s with 1s overlap = 3*10 - 2*1 = 28s
    expect(chainedDurationMs(10000, 1000, 3)).toBe(28000);
  });
});
