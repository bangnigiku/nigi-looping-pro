import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  formatTimecode,
  frameDurationMs,
  framesToMs,
  msToFrames,
  parseDurationInput,
  parseRational,
  quantizeMs,
  secArg,
  stepByFrames,
} from '../../src/shared/time';

describe('time helpers', () => {
  it('calculates frame duration accurately for standard and rational FPS', () => {
    expect(frameDurationMs({ num: 24, den: 1 })).toBeCloseTo(41.6667, 3);
    expect(frameDurationMs({ num: 25, den: 1 })).toBe(40);
    expect(frameDurationMs({ num: 30, den: 1 })).toBeCloseTo(33.3333, 3);
    expect(frameDurationMs({ num: 60, den: 1 })).toBeCloseTo(16.6667, 3);

    // Rational 30000/1001 (NTSC 29.97 FPS)
    const ntscFps = { num: 30000, den: 1001 };
    expect(frameDurationMs(ntscFps)).toBeCloseTo(33.3667, 3);
  });

  it('steps precisely by frame forward and backward at standard FPS (24, 25, 30, 60)', () => {
    const fps24 = { num: 24, den: 1 };
    const step1 = stepByFrames(0, fps24, 1, 10000);
    expect(step1).toBe(42);
    const stepBack = stepByFrames(step1, fps24, -1, 10000);
    expect(stepBack).toBe(0);

    const fps30 = { num: 30, den: 1 };
    expect(stepByFrames(0, fps30, 1, 10000)).toBe(33);
    expect(stepByFrames(33, fps30, 1, 10000)).toBe(67);
    expect(stepByFrames(67, fps30, -1, 10000)).toBe(33);

    const fps60 = { num: 60, den: 1 };
    expect(stepByFrames(0, fps60, 1, 10000)).toBe(17);
  });

  it('steps frames accurately without drift on rational FPS 30000/1001', () => {
    const ntsc = { num: 30000, den: 1001 };
    let cur = 0;
    // Advance 30 frames
    for (let i = 0; i < 30; i++) {
      cur = stepByFrames(cur, ntsc, 1, 10000);
    }
    // 30 frames at 30000/1001 FPS = 30 * 1001 / 30 = 1001 ms exactly!
    expect(cur).toBeCloseTo(1001, 1);

    // Step back 30 frames
    for (let i = 0; i < 30; i++) {
      cur = stepByFrames(cur, ntsc, -1, 10000);
    }
    expect(cur).toBe(0);
  });

  it('clamps frame-step at 0 and max timeline duration', () => {
    const fps = { num: 30, den: 1 };
    expect(stepByFrames(0, fps, -1, 5000)).toBe(0);
    expect(stepByFrames(4980, fps, 1, 5000)).toBe(5000);
    expect(stepByFrames(5000, fps, 1, 5000)).toBe(5000);
  });

  it('steps accurately from middle of clip / arbitrary scrub position', () => {
    const fps = { num: 24, den: 1 };
    // Scrubbed to 1234ms (closest to frame 30 = 1250ms)
    // Stepping forward advances to frame 31 = 1292ms
    const next = stepByFrames(1234, fps, 1, 10000);
    expect(next).toBe(1292);
    // Stepping backward from 1292ms returns to frame 30 = 1250ms
    const prev = stepByFrames(next, fps, -1, 10000);
    expect(prev).toBe(1250);
  });
  it('parses rational FPS strings', () => {
    expect(parseRational('30000/1001')).toEqual({ num: 30000, den: 1001 });
    expect(parseRational('24/1')).toEqual({ num: 24, den: 1 });
    expect(parseRational('invalid')).toBeUndefined();
    expect(parseRational('0/0')).toBeUndefined();
  });

  it('converts ms <-> frames correctly', () => {
    const fps = { num: 30, den: 1 };
    expect(msToFrames(1000, fps)).toBe(30);
    expect(framesToMs(30, fps)).toBe(1000);
    expect(quantizeMs(1016, fps)).toBeCloseTo(1000, 0);
  });

  it('formats timecode correctly', () => {
    const fps = { num: 30, den: 1 };
    expect(formatTimecode(0, fps)).toBe('00:00:00:00');
    expect(formatTimecode(1000, fps)).toBe('00:00:01:00');
    expect(formatTimecode(65100, fps)).toBe('00:01:05:03');
  });

  it('formats duration strings', () => {
    expect(formatDuration(5000)).toBe('0:05.0');
    expect(formatDuration(65400)).toBe('1:05.4');
    expect(formatDuration(3665000)).toBe('1:01:05');
  });

  it('parses user duration input', () => {
    expect(parseDurationInput('10')).toBe(10000);
    expect(parseDurationInput('1:30')).toBe(90000);
    expect(parseDurationInput('01:02:03')).toBe(3723000);
    expect(parseDurationInput('abc')).toBeNull();
  });

  it('formats secArg with microsecond precision', () => {
    expect(secArg(1500)).toBe('1.5');
    expect(secArg(0)).toBe('0');
    expect(secArg(10000)).toBe('10');
  });
});
