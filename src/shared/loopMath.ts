import { framesToMs, msToFrames } from './time';
import type { LoopSettings, Rational } from './types';

export const MAX_REPETITIONS = 5000;
export const AUDIO_RATE = 48000;

export type LoopMathError =
  | 'unit-too-short'
  | 'overlap-too-long'
  | 'target-too-short'
  | 'too-many-repetitions';

/**
 * Loop geometry, expressed in whole frames so video and audio boundaries line up exactly.
 *
 * A unit U of length L is repeated with an overlap O (the crossfade region).
 * n repetitions chained with crossfades last  n*L - (n-1)*O  =  n*T + O,  where T = L - O.
 *
 * The output is assembled as:
 *   head = U[0, L-O)                         (length T)
 *   tile = X(U[L-O, L) -> U[0, O)) + U[O, L-O) (length T)   repeated n-1 times
 *   tail = U[L-O, L)                         (length O)
 * and then cut at the target duration.
 */
export interface LoopMath {
  fps: Rational;
  unitFrames: number;
  overlapFrames: number;
  tileFrames: number;
  repetitions: number;
  /** Frames of the full (un-cut) chained output: n*T + O. */
  fullFrames: number;
  targetFrames: number;
  /** Video transition position within the overlap window. */
  videoStartFrames: number;
  videoFrames: number;
  /** Audio crossfade position within the overlap window, in samples at AUDIO_RATE. */
  audioStartSamples: number;
  audioSamples: number;
  audioEnabled: boolean;
}

export function framesToSamples(frames: number, fps: Rational): number {
  return Math.round((frames * AUDIO_RATE * fps.den) / fps.num);
}

export function msToSamples(ms: number): number {
  return Math.round((ms * AUDIO_RATE) / 1000);
}

/** Maximum allowed overlap for a unit: half the unit (so the middle section is never negative). */
export function maxOverlapMs(unitMs: number): number {
  return Math.max(0, Math.floor(unitMs / 2));
}

export function computeLoopMath(
  unitMs: number,
  loop: Pick<LoopSettings, 'targetDurationMs' | 'videoCrossfadeMs' | 'audioCrossfadeEnabled' | 'audioCrossfadeMs'>,
  fps: Rational,
  hasAudio: boolean,
): { ok: true; math: LoopMath } | { ok: false; error: LoopMathError } {
  const unitFrames = msToFrames(unitMs, fps);
  if (unitFrames < 2) return { ok: false, error: 'unit-too-short' };

  const vFrames = Math.max(0, msToFrames(loop.videoCrossfadeMs, fps));
  const audioEnabled = hasAudio && loop.audioCrossfadeEnabled && loop.audioCrossfadeMs > 0;
  const aFrames = audioEnabled ? Math.max(0, msToFrames(loop.audioCrossfadeMs, fps)) : 0;
  const overlapFrames = Math.max(vFrames, aFrames);
  if (overlapFrames * 2 > unitFrames) return { ok: false, error: 'overlap-too-long' };

  const targetFrames = msToFrames(loop.targetDurationMs, fps);
  if (targetFrames < 1) return { ok: false, error: 'target-too-short' };

  const tileFrames = unitFrames - overlapFrames;
  const repetitions = Math.max(1, Math.ceil((targetFrames - overlapFrames) / tileFrames));
  if (repetitions > MAX_REPETITIONS) return { ok: false, error: 'too-many-repetitions' };

  const fullFrames = repetitions * tileFrames + overlapFrames;
  const videoStartFrames = Math.floor((overlapFrames - vFrames) / 2);
  const overlapSamples = framesToSamples(overlapFrames, fps);
  const audioSamples = audioEnabled ? Math.min(overlapSamples, msToSamples(loop.audioCrossfadeMs)) : 0;
  const audioStartSamples = Math.floor((overlapSamples - audioSamples) / 2);

  return {
    ok: true,
    math: {
      fps,
      unitFrames,
      overlapFrames,
      tileFrames,
      repetitions,
      fullFrames,
      targetFrames: Math.min(targetFrames, fullFrames),
      videoStartFrames,
      videoFrames: vFrames,
      audioStartSamples,
      audioSamples,
      audioEnabled,
    },
  };
}

/** Duration in ms that an N-repetition crossfaded chain produces. */
export function chainedDurationMs(unitMs: number, overlapMs: number, repetitions: number): number {
  return repetitions * unitMs - (repetitions - 1) * overlapMs;
}

export function loopMathSummary(m: LoopMath): { unitMs: number; overlapMs: number; fullMs: number; targetMs: number } {
  return {
    unitMs: framesToMs(m.unitFrames, m.fps),
    overlapMs: framesToMs(m.overlapFrames, m.fps),
    fullMs: framesToMs(m.fullFrames, m.fps),
    targetMs: framesToMs(m.targetFrames, m.fps),
  };
}

/** Segment order of the assembled output (cut as soon as the target is reached). */
export type LoopSegment = 'head' | 'tile' | 'tail' | 'unit';

export function loopSegmentSequence(m: LoopMath): LoopSegment[] {
  const seq: LoopSegment[] = [];
  let acc = 0;
  if (m.overlapFrames === 0) {
    while (acc < m.targetFrames) {
      seq.push('unit');
      acc += m.unitFrames;
    }
    return seq;
  }
  seq.push('head');
  acc += m.tileFrames;
  let tiles = 0;
  while (acc < m.targetFrames && tiles < m.repetitions - 1) {
    seq.push('tile');
    acc += m.tileFrames;
    tiles++;
  }
  if (acc < m.targetFrames) seq.push('tail');
  return seq;
}
