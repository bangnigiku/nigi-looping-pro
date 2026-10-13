/**
 * Pure FFmpeg render planning. Produces argument arrays (never shell strings) for:
 *  - direct timeline export
 *  - seamless loop export (unit -> head/tile/tail segments -> concat + final encode)
 *  - short loop-seam preview renders
 */
import { resolveOutputSize } from './aspect';
import { AUDIO_RATE, computeLoopMath, framesToSamples, loopSegmentSequence, type LoopMath, type LoopMathError } from './loopMath';
import { framesToMs, msToFrames, rationalToString, resolveProjectFps, secArg } from './time';
import { clipEnd, getAsset, getClip, getTrack } from './timeline';
import type { BackgroundMode, ExportSettings, FitMode, ProjectDocument, Rational, VideoTransition } from './types';

export interface ResolvedClip {
  path: string;
  startMs: number;
  inMs: number;
  outMs: number;
  volume: number;
  useVideo: boolean;
  useAudio: boolean;
  fitMode: FitMode;
  /** Source has non-square pixels and must be corrected first. */
  sarFix: boolean;
}

export interface SequenceSpec {
  video: ResolvedClip[];
  audio: ResolvedClip[];
  durationMs: number;
  hasAudio: boolean;
  hasVideoContent: boolean;
}

export interface CanvasSpec {
  width: number;
  height: number;
  fps: Rational;
  backgroundColor: string;
  backgroundMode: BackgroundMode;
}

export type PlanError =
  | 'empty-timeline'
  | 'loop-clip-missing'
  | 'no-audio-for-m4a'
  | 'command-too-long'
  | `loop-${LoopMathError}`;

/* ------------------------------------------------------------------ */
/* Sequence resolution                                                 */
/* ------------------------------------------------------------------ */

function resolveClipFor(project: ProjectDocument, clipId: string, startOverride?: number): ResolvedClip | null {
  const clip = getClip(project, clipId);
  if (!clip) return null;
  const asset = getAsset(project, clip.assetId);
  const track = getTrack(project, clip.trackId);
  if (!asset || !track) return null;
  const m = asset.metadata;
  const isVideoTrack = track.kind === 'video';
  return {
    path: asset.path,
    startMs: startOverride ?? clip.startMs,
    inMs: clip.inMs,
    outMs: clip.outMs,
    volume: clip.volume,
    useVideo: isVideoTrack && m.hasVideo && !track.hidden,
    useAudio: m.hasAudio && !clip.muted && !track.muted && clip.volume > 0,
    fitMode: clip.fitMode,
    sarFix: Boolean(m.width && m.displayWidth && m.height && m.displayHeight && m.width * m.displayHeight !== m.height * m.displayWidth && !m.rotation),
  };
}

export function resolveSequence(project: ProjectDocument): SequenceSpec {
  const video: ResolvedClip[] = [];
  const audio: ResolvedClip[] = [];
  let durationMs = 0;
  for (const c of [...project.clips].sort((a, b) => a.startMs - b.startMs)) {
    const r = resolveClipFor(project, c.id);
    const track = getTrack(project, c.trackId);
    if (!r || !track) continue;
    durationMs = Math.max(durationMs, clipEnd(c));
    if (track.kind === 'video') video.push(r);
    else audio.push(r);
  }
  return finalizeSpec(video, audio, durationMs);
}

/** A single clip placed at time 0, used as the loop unit when looping one clip. */
export function resolveClipUnit(project: ProjectDocument, clipId: string): SequenceSpec | null {
  const clip = getClip(project, clipId);
  const track = clip && getTrack(project, clip.trackId);
  const r = clip ? resolveClipFor(project, clipId, 0) : null;
  if (!clip || !track || !r) return null;
  const dur = clip.outMs - clip.inMs;
  return track.kind === 'video' ? finalizeSpec([r], [], dur) : finalizeSpec([], [r], dur);
}

function finalizeSpec(video: ResolvedClip[], audio: ResolvedClip[], durationMs: number): SequenceSpec {
  return {
    video,
    audio,
    durationMs,
    hasAudio: [...video, ...audio].some((c) => c.useAudio),
    hasVideoContent: video.some((c) => c.useVideo),
  };
}

export function resolveCanvas(project: ProjectDocument, maxHeight?: number): CanvasSpec {
  let { width, height } = resolveOutputSize(project);
  if (maxHeight && height > maxHeight) {
    const s = maxHeight / height;
    width = Math.max(2, Math.round((width * s) / 2) * 2);
    height = Math.max(2, Math.round((height * s) / 2) * 2);
  }
  return {
    width,
    height,
    fps: resolveProjectFps(project),
    backgroundColor: project.settings.aspect.backgroundColor,
    backgroundMode: project.settings.aspect.backgroundMode,
  };
}

/** Returns the loop unit spec according to loop settings. */
export function resolveLoopUnit(project: ProjectDocument): { ok: true; spec: SequenceSpec } | { ok: false; error: PlanError } {
  const loop = project.settings.loop;
  if (loop.source === 'clip') {
    if (!loop.clipId) return { ok: false, error: 'loop-clip-missing' };
    const spec = resolveClipUnit(project, loop.clipId);
    if (!spec) return { ok: false, error: 'loop-clip-missing' };
    return { ok: true, spec };
  }
  const spec = resolveSequence(project);
  if (spec.durationMs <= 0) return { ok: false, error: 'empty-timeline' };
  return { ok: true, spec };
}

/* ------------------------------------------------------------------ */
/* Filter graph builder                                                */
/* ------------------------------------------------------------------ */

export function colorArg(hex: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(hex) ? `0x${hex.slice(1).toUpperCase()}` : '0x000000';
}

function fitChain(fit: FitMode, c: CanvasSpec, inLabel: string, outLabel: string, prefix: string): string[] {
  const { width: W, height: H } = c;
  if (fit === 'fill') {
    return [`${inLabel}scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1${outLabel}`];
  }
  if (fit === 'stretch') {
    return [`${inLabel}scale=${W}:${H},setsar=1${outLabel}`];
  }
  if (c.backgroundMode === 'blur') {
    const sw = Math.max(16, Math.round(W / 16) * 2);
    const sh = Math.max(16, Math.round(H / 16) * 2);
    return [
      `${inLabel}split=2[${prefix}bgi][${prefix}fgi]`,
      `[${prefix}bgi]scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${sw}:${sh},boxblur=6:2,scale=${W}:${H},setsar=1[${prefix}bg]`,
      `[${prefix}fgi]scale=${W}:${H}:force_original_aspect_ratio=decrease,setsar=1[${prefix}fg]`,
      `[${prefix}bg][${prefix}fg]overlay=x=(main_w-overlay_w)/2:y=(main_h-overlay_h)/2,setsar=1${outLabel}`,
    ];
  }
  return [
    `${inLabel}scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2:color=${colorArg(c.backgroundColor)},setsar=1${outLabel}`,
  ];
}

export interface GraphOptions {
  rangeStartMs?: number;
  rangeEndMs?: number;
  includeVideo: boolean;
  includeAudio: boolean;
  prefix: string;
  inputOffset: number;
}

export interface GraphResult {
  inputArgs: string[];
  filters: string[];
  videoLabel: string | null;
  audioLabel: string | null;
  frames: number;
  samples: number;
  inputCount: number;
}

interface Segment {
  startF: number;
  endF: number;
  clip?: ResolvedClip;
  /** Source time (ms) at segment start. */
  srcMs?: number;
}

function buildSegments(clips: ResolvedClip[], fps: Rational, rangeStartF: number, rangeEndF: number, needs: (c: ResolvedClip) => boolean): Segment[] {
  const segs: Segment[] = [];
  let cursor = rangeStartF;
  const sorted = clips.filter(needs).sort((a, b) => a.startMs - b.startMs);
  for (const c of sorted) {
    const cs = msToFrames(c.startMs, fps);
    const ce = msToFrames(c.startMs + (c.outMs - c.inMs), fps);
    const s = Math.max(cs, cursor);
    const e = Math.min(ce, rangeEndF);
    if (e <= s) continue;
    if (s > cursor) segs.push({ startF: cursor, endF: s });
    segs.push({ startF: s, endF: e, clip: c, srcMs: c.inMs + framesToMs(s - cs, fps) });
    cursor = e;
  }
  if (cursor < rangeEndF) segs.push({ startF: cursor, endF: rangeEndF });
  return segs;
}

/**
 * Builds a filter graph rendering [rangeStart, rangeEnd) of a sequence onto the canvas.
 * Every segment is padded/trimmed to an exact frame and sample count so concatenation never drifts.
 */
export function buildSequenceGraph(seq: SequenceSpec, canvas: CanvasSpec, opts: GraphOptions): GraphResult {
  const { fps } = canvas;
  const fpsStr = rationalToString(fps);
  const rs = msToFrames(opts.rangeStartMs ?? 0, fps);
  const re = msToFrames(opts.rangeEndMs ?? seq.durationMs, fps);
  const p = opts.prefix;
  const inputArgs: string[] = [];
  const filters: string[] = [];
  let inputIndex = opts.inputOffset;
  const samplesAt = (f: number): number => framesToSamples(f - rs, fps);
  const totalSamples = samplesAt(re);
  const sizeStr = `${canvas.width}x${canvas.height}`;
  const bg = colorArg(canvas.backgroundColor);

  const addInput = (c: ResolvedClip, srcMs: number, frames: number): number => {
    const durMs = framesToMs(frames, fps);
    // Input seeking (-ss before -i) is frame accurate when transcoding. Small slack covers rounding.
    inputArgs.push('-ss', secArg(srcMs), '-t', secArg(durMs + 250), '-i', c.path);
    return inputIndex++;
  };

  const audioChain = (src: string, c: ResolvedClip, samples: number, out: string): string =>
    `${src}asetpts=PTS-STARTPTS,aresample=${AUDIO_RATE},aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${c.volume.toFixed(4)},apad,atrim=end_sample=${samples},asetpts=N/SR/TB${out}`;
  const silence = (samples: number, out: string): string =>
    `anullsrc=r=${AUDIO_RATE}:cl=stereo,atrim=end_sample=${samples},aformat=sample_fmts=fltp:channel_layouts=stereo,asetpts=N/SR/TB${out}`;

  let videoLabel: string | null = null;
  let audioLabel: string | null = null;

  // ---- Video track (with the audio embedded in its clips) ----
  const vSegs = buildSegments(seq.video, fps, rs, re, (c) => c.useVideo || (opts.includeAudio && c.useAudio));
  const concatInputs: string[] = [];
  vSegs.forEach((s, i) => {
    const frames = s.endF - s.startF;
    const samples = samplesAt(s.endF) - samplesAt(s.startF);
    const vl = `[${p}v${i}]`;
    const al = `[${p}a${i}]`;
    const c = s.clip;
    let idx = -1;
    if (c && ((opts.includeVideo && c.useVideo) || (opts.includeAudio && c.useAudio))) idx = addInput(c, s.srcMs ?? c.inMs, frames);
    if (opts.includeVideo) {
      if (c && c.useVideo) {
        const pre = `${c.sarFix ? 'scale=iw*sar:ih,setsar=1,' : ''}setpts=PTS-STARTPTS,fps=${fpsStr}`;
        filters.push(`[${idx}:v]${pre}[${p}vp${i}]`);
        filters.push(...fitChain(c.fitMode, canvas, `[${p}vp${i}]`, `[${p}vf${i}]`, `${p}f${i}`));
        filters.push(`[${p}vf${i}]format=yuv420p,tpad=stop_mode=clone:stop_duration=2,trim=end_frame=${frames},setpts=PTS-STARTPTS${vl}`);
      } else {
        filters.push(`color=c=${bg}:s=${sizeStr}:r=${fpsStr},format=yuv420p,setsar=1,trim=end_frame=${frames},setpts=PTS-STARTPTS${vl}`);
      }
      concatInputs.push(vl);
    }
    if (opts.includeAudio) {
      filters.push(c && c.useAudio ? audioChain(`[${idx}:a]`, c, samples, al) : silence(samples, al));
      concatInputs.push(al);
    }
  });
  const v = opts.includeVideo ? 1 : 0;
  const a = opts.includeAudio ? 1 : 0;
  if (v || a) {
    const outs = `${v ? `[${p}vseq]` : ''}${a ? `[${p}aseq]` : ''}`;
    filters.push(`${concatInputs.join('')}concat=n=${vSegs.length}:v=${v}:a=${a}${outs}`);
    if (v) videoLabel = `[${p}vseq]`;
    if (a) audioLabel = `[${p}aseq]`;
  }

  // ---- Audio track ----
  if (opts.includeAudio) {
    const aSegs = buildSegments(seq.audio, fps, rs, re, (c) => c.useAudio);
    if (aSegs.some((s) => s.clip)) {
      const labels: string[] = [];
      aSegs.forEach((s, i) => {
        const samples = samplesAt(s.endF) - samplesAt(s.startF);
        const al = `[${p}b${i}]`;
        if (s.clip) {
          const idx = addInput(s.clip, s.srcMs ?? s.clip.inMs, s.endF - s.startF);
          filters.push(audioChain(`[${idx}:a]`, s.clip, samples, al));
        } else filters.push(silence(samples, al));
        labels.push(al);
      });
      filters.push(`${labels.join('')}concat=n=${aSegs.length}:v=0:a=1[${p}atr]`);
      filters.push(`[${p}aseq][${p}atr]amix=inputs=2:normalize=0:duration=first:dropout_transition=0,atrim=end_sample=${totalSamples}[${p}amix]`);
      audioLabel = `[${p}amix]`;
    }
  }

  return { inputArgs, filters, videoLabel, audioLabel, frames: re - rs, samples: totalSamples, inputCount: inputIndex - opts.inputOffset };
}

/* ------------------------------------------------------------------ */
/* Encoding settings                                                   */
/* ------------------------------------------------------------------ */

export function qualityToX264(s: ExportSettings): { crf: number; preset: string } {
  switch (s.quality) {
    case 'draft':
      return { crf: 28, preset: 'veryfast' };
    case 'balanced':
      return { crf: 20, preset: 'medium' };
    case 'high':
      return { crf: 17, preset: 'slow' };
    case 'custom':
    default:
      return { crf: Math.min(51, Math.max(0, Math.round(s.crf))), preset: s.x264Preset };
  }
}

function finalVideoArgs(s: ExportSettings, fps: Rational): string[] {
  const q = qualityToX264(s);
  return ['-c:v', 'libx264', '-preset', q.preset, '-crf', String(q.crf), '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-r', rationalToString(fps), '-fps_mode', 'cfr'];
}

function finalAudioArgs(s: ExportSettings): string[] {
  return ['-c:a', 'aac', '-b:a', `${Math.round(s.audioBitrateKbps)}k`, '-ar', String(AUDIO_RATE), '-ac', '2'];
}

const INTERMEDIATE_VIDEO = ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', '12', '-g', '1', '-bf', '0', '-pix_fmt', 'yuv420p'];
const INTERMEDIATE_AUDIO = ['-c:a', 'pcm_s16le', '-ar', String(AUDIO_RATE), '-ac', '2'];
const COMMON = ['-hide_banner', '-nostdin', '-y', '-loglevel', 'error', '-progress', 'pipe:1', '-nostats'];

function postAudioFilters(s: ExportSettings, totalMs: number, endFadeMs: number): string[] {
  const f: string[] = [];
  if (s.normalizeAudio) f.push('loudnorm=I=-14:TP=-1.5:LRA=11', `aresample=${AUDIO_RATE}`);
  if (s.limitPeaks) f.push('alimiter=limit=0.891:level=0:latency=1');
  if (endFadeMs > 0) f.push(`afade=t=out:st=${secArg(Math.max(0, totalMs - endFadeMs))}:d=${secArg(Math.min(endFadeMs, totalMs))}`);
  return f;
}

function postVideoFilters(totalMs: number, endFadeMs: number): string[] {
  return endFadeMs > 0 ? [`fade=t=out:st=${secArg(Math.max(0, totalMs - endFadeMs))}:d=${secArg(Math.min(endFadeMs, totalMs))}:color=black`] : [];
}

/* ------------------------------------------------------------------ */
/* Plans                                                               */
/* ------------------------------------------------------------------ */

export type StageKey = 'render' | 'unit' | 'segments' | 'final' | 'preview';

export interface PlanStep {
  stage: StageKey;
  args: string[];
  /** Media duration this step produces; used to convert FFmpeg out_time into progress. */
  durationMs: number;
  /** Relative weight for overall progress. */
  weight: number;
  outputs: string[];
  /** Files to write before running the step. */
  files: { path: string; content: string }[];
}

export interface RenderPlan {
  steps: PlanStep[];
  finalTempPath: string;
  expectedDurationMs: number;
  hasAudio: boolean;
  hasVideo: boolean;
  width: number;
  height: number;
  fps: Rational;
  loop?: LoopMath;
  tempFiles: string[];
}

export interface PlanPaths {
  tempDir: string;
  /** Temporary output file (renamed to the final name after verification). */
  finalTempPath: string;
}

/** Windows CreateProcess limit is 32767 characters; keep margin. */
export const MAX_COMMAND_CHARS = 30000;

function joinPath(dir: string, name: string): string {
  return `${dir.replace(/[\\/]+$/, '')}/${name}`;
}

function filterArgs(filters: string[], tempDir: string, name: string, files: PlanStep['files']): string[] {
  const graph = filters.join(';\n');
  if (graph.length < 6000) return ['-filter_complex', graph.replace(/;\n/g, ';')];
  const scriptPath = joinPath(tempDir, `${name}.filtergraph`);
  files.push({ path: scriptPath, content: graph });
  return ['-filter_complex_script', scriptPath];
}

function commandLength(args: string[]): number {
  return args.reduce((n, a) => n + a.length + 3, 0);
}

export function buildExportPlan(project: ProjectDocument, paths: PlanPaths): { ok: true; plan: RenderPlan } | { ok: false; error: PlanError } {
  const exp = project.settings.export;
  const loop = project.settings.loop;
  const canvas = resolveCanvas(project);
  const audioOnly = exp.container === 'm4a';

  if (!loop.enabled) {
    const seq = resolveSequence(project);
    if (seq.durationMs <= 0) return { ok: false, error: 'empty-timeline' };
    if (audioOnly && !seq.hasAudio) return { ok: false, error: 'no-audio-for-m4a' };
    const includeAudio = seq.hasAudio;
    const includeVideo = !audioOnly;
    const g = buildSequenceGraph(seq, canvas, { includeAudio, includeVideo, prefix: 's', inputOffset: 0 });
    const totalMs = framesToMs(g.frames, canvas.fps);
    const files: PlanStep['files'] = [];
    const filters = [...g.filters];
    const maps: string[] = [];
    if (includeVideo && g.videoLabel) {
      const post = postVideoFilters(totalMs, 0);
      filters.push(`${g.videoLabel}${post.length ? post.join(',') : 'null'}[vout]`);
      maps.push('-map', '[vout]', ...finalVideoArgs(exp, canvas.fps));
    }
    if (includeAudio && g.audioLabel) {
      const post = postAudioFilters(exp, totalMs, 0);
      filters.push(`${g.audioLabel}${post.length ? post.join(',') : 'anull'}[aout]`);
      maps.push('-map', '[aout]', ...finalAudioArgs(exp));
    }
    const args = [...COMMON, ...g.inputArgs, ...filterArgs(filters, paths.tempDir, 'render', files), ...maps, '-t', secArg(totalMs), '-movflags', '+faststart', paths.finalTempPath];
    if (commandLength(args) > MAX_COMMAND_CHARS) return { ok: false, error: 'command-too-long' };
    return {
      ok: true,
      plan: {
        steps: [{ stage: 'render', args, durationMs: totalMs, weight: 1, outputs: [paths.finalTempPath], files }],
        finalTempPath: paths.finalTempPath,
        expectedDurationMs: totalMs,
        hasAudio: includeAudio,
        hasVideo: includeVideo,
        width: canvas.width,
        height: canvas.height,
        fps: canvas.fps,
        tempFiles: files.map((f) => f.path),
      },
    };
  }

  // ---------------- Seamless loop ----------------
  const unit = resolveLoopUnit(project);
  if (!unit.ok) return unit;
  const seq = unit.spec;
  if (audioOnly && !seq.hasAudio) return { ok: false, error: 'no-audio-for-m4a' };
  const includeAudio = seq.hasAudio;
  const includeVideo = !audioOnly;
  const lm = computeLoopMath(seq.durationMs, loop, canvas.fps, includeAudio);
  if (!lm.ok) return { ok: false, error: `loop-${lm.error}` };
  const m = lm.math;
  const fps = canvas.fps;
  const steps: PlanStep[] = [];
  const tempFiles: string[] = [];
  const unitMs = framesToMs(m.unitFrames, fps);

  // Step 1: render the unit to a high quality intermediate.
  const unitPath = joinPath(paths.tempDir, 'unit.mov');
  tempFiles.push(unitPath);
  {
    const g = buildSequenceGraph(seq, canvas, { includeAudio, includeVideo, prefix: 'u', inputOffset: 0, rangeStartMs: 0, rangeEndMs: unitMs });
    const files: PlanStep['files'] = [];
    const maps: string[] = [];
    if (g.videoLabel) maps.push('-map', g.videoLabel, ...INTERMEDIATE_VIDEO, '-r', rationalToString(fps));
    if (g.audioLabel) maps.push('-map', g.audioLabel, ...INTERMEDIATE_AUDIO);
    const args = [...COMMON, ...g.inputArgs, ...filterArgs(g.filters, paths.tempDir, 'unit', files), ...maps, unitPath];
    if (commandLength(args) > MAX_COMMAND_CHARS) return { ok: false, error: 'command-too-long' };
    tempFiles.push(...files.map((f) => f.path));
    steps.push({ stage: 'unit', args, durationMs: unitMs, weight: unitMs, outputs: [unitPath], files });
  }

  // Step 2: build head / tile / tail segments from the unit.
  const segNames = { head: 'head.mov', tile: 'tile.mov', tail: 'tail.mov', unit: 'unit.mov' } as const;
  if (m.overlapFrames > 0) {
    const L = m.unitFrames;
    const O = m.overlapFrames;
    const midFrames = L - 2 * O;
    const S = (f: number): number => framesToSamples(f, fps);
    const vf: string[] = [];
    const maps: string[] = [];
    const outs = {
      head: joinPath(paths.tempDir, segNames.head),
      tile: joinPath(paths.tempDir, segNames.tile),
      tail: joinPath(paths.tempDir, segNames.tail),
    };
    tempFiles.push(outs.head, outs.tile, outs.tail);
    const vTrim = (a: number, b: number, out: string, src: string): string => `${src}trim=start_frame=${a}:end_frame=${b},setpts=PTS-STARTPTS${out}`;
    const aTrim = (a: number, b: number, out: string, src: string): string => `${src}atrim=start_sample=${a}:end_sample=${b},asetpts=N/SR/TB${out}`;

    const perOutput: Record<'head' | 'tile' | 'tail', string[]> = { head: [], tile: [], tail: [] };

    if (includeVideo) {
      const hasMid = midFrames > 0;
      const n = hasMid ? 5 : 4;
      vf.push(`[0:v]split=${n}[vh][vt][vxa][vxb]${hasMid ? '[vm]' : ''}`);
      vf.push(vTrim(0, L - O, '[headv]', '[vh]'));
      vf.push(vTrim(L - O, L, '[tailv]', '[vt]'));
      if (m.videoFrames > 0) {
        const vs = m.videoStartFrames;
        const vd = m.videoFrames;
        if (vs === 0 && vd === O) {
          vf.push(vTrim(L - O, L, '[xa]', '[vxa]'));
          vf.push(vTrim(0, O, '[xb]', '[vxb]'));
          vf.push(`[xa][xb]xfade=transition=${project.settings.loop.videoTransition}:duration=${secArg(framesToMs(O, fps))}:offset=0.0000[xv]`);
        } else {
          vf.push(vTrim(L - O, L - O + vs + vd, '[xa]', '[vxa]'));
          vf.push(vTrim(0, O - vs, '[xb]', '[vxb]'));
          vf.push(`[xa][xb]xfade=transition=${project.settings.loop.videoTransition}:duration=${secArg(framesToMs(vd, fps))}:offset=${secArg(framesToMs(vs, fps))}[xv]`);
        }
      } else {
        vf.push('[vxa]nullsink');
        vf.push(vTrim(0, O, '[xv]', '[vxb]'));
      }
      if (hasMid) {
        vf.push(vTrim(O, L - O, '[midv]', '[vm]'));
        vf.push(`[xv][midv]concat=n=2:v=1:a=0[tilev]`);
      } else vf.push(`[xv]null[tilev]`);
      const rArg = ['-r', rationalToString(fps)];
      perOutput.head.push('-map', '[headv]', ...INTERMEDIATE_VIDEO, ...rArg);
      perOutput.tile.push('-map', '[tilev]', ...INTERMEDIATE_VIDEO, ...rArg);
      perOutput.tail.push('-map', '[tailv]', ...INTERMEDIATE_VIDEO, ...rArg);
    }
    if (includeAudio) {
      const hasMid = midFrames > 0;
      const n = hasMid ? 5 : 4;
      vf.push(`[0:a]asplit=${n}[ah][at][axa][axb]${hasMid ? '[am]' : ''}`);
      vf.push(aTrim(0, S(L - O), '[heada]', '[ah]'));
      vf.push(aTrim(S(L - O), S(L), '[taila]', '[at]'));
      if (m.audioSamples > 0) {
        const as = m.audioStartSamples;
        const ad = m.audioSamples;
        const asSec = secArg((as / AUDIO_RATE) * 1000);
        const adSec = secArg((ad / AUDIO_RATE) * 1000);
        const curve = project.settings.loop.audioCurve;
        vf.push(
          aTrim(S(L - O), S(L), '[axa_cut]', '[axa]'),
          `[axa_cut]afade=t=out:st=${asSec}:d=${adSec}:curve=${curve}[af1]`,
          aTrim(0, S(O), '[axb_cut]', '[axb]'),
          `[axb_cut]afade=t=in:st=${asSec}:d=${adSec}:curve=${curve}[af2]`,
          `[af1][af2]amix=inputs=2:weights=1 1:normalize=0:duration=first:dropout_transition=0,atrim=end_sample=${S(O)},asetpts=N/SR/TB[xau]`
        );
      } else {
        vf.push('[axa]anullsink');
        vf.push(aTrim(0, S(O), '[xau]', '[axb]'));
      }
      if (hasMid) {
        vf.push(aTrim(S(O), S(L - O), '[mida]', '[am]'));
        vf.push(`[xau][mida]concat=n=2:v=0:a=1[tilea]`);
      } else vf.push(`[xau]anull[tilea]`);
      perOutput.head.push('-map', '[heada]', ...INTERMEDIATE_AUDIO);
      perOutput.tile.push('-map', '[tilea]', ...INTERMEDIATE_AUDIO);
      perOutput.tail.push('-map', '[taila]', ...INTERMEDIATE_AUDIO);
    }
    const files: PlanStep['files'] = [];
    maps.push(...perOutput.head, outs.head, ...perOutput.tile, outs.tile, ...perOutput.tail, outs.tail);
    const args = [...COMMON, '-i', unitPath, ...filterArgs(vf, paths.tempDir, 'segments', files), ...maps];
    tempFiles.push(...files.map((f) => f.path));
    const segMs = framesToMs(L - O, fps);
    steps.push({ stage: 'segments', args, durationMs: segMs, weight: unitMs * 1.5, outputs: [outs.head, outs.tile, outs.tail], files });
  }

  // Step 3: concat demuxer + final encode, cut exactly at the target duration.
  const order = loopSegmentSequence(m);
  const listPath = joinPath(paths.tempDir, 'loop.ffconcat');
  tempFiles.push(listPath);
  const listContent = ['ffconcat version 1.0', ...order.map((s) => `file '${segNames[s]}'`)].join('\n') + '\n';
  const totalMs = framesToMs(m.targetFrames, fps);
  const filters: string[] = [];
  const maps: string[] = [];
  if (includeVideo) {
    const post = postVideoFilters(totalMs, loop.endFadeMs);
    filters.push(`[0:v]${post.length ? post.join(',') : 'null'}[vout]`);
    maps.push('-map', '[vout]', ...finalVideoArgs(exp, fps));
  }
  if (includeAudio) {
    const post = postAudioFilters(exp, totalMs, loop.endFadeMs);
    filters.push(`[0:a]${post.length ? post.join(',') : 'anull'}[aout]`);
    maps.push('-map', '[aout]', ...finalAudioArgs(exp));
  }
  const finalArgs = [...COMMON, '-f', 'concat', '-safe', '0', '-i', listPath, '-filter_complex', filters.join(';'), ...maps, '-t', secArg(totalMs), '-movflags', '+faststart', paths.finalTempPath];
  steps.push({ stage: 'final', args: finalArgs, durationMs: totalMs, weight: totalMs, outputs: [paths.finalTempPath], files: [{ path: listPath, content: listContent }] });

  return {
    ok: true,
    plan: {
      steps,
      finalTempPath: paths.finalTempPath,
      expectedDurationMs: totalMs,
      hasAudio: includeAudio,
      hasVideo: includeVideo,
      width: canvas.width,
      height: canvas.height,
      fps,
      loop: m,
      tempFiles,
    },
  };
}

/* ------------------------------------------------------------------ */
/* Loop seam preview                                                   */
/* ------------------------------------------------------------------ */

export const PREVIEW_CONTEXT_MS = 2000;
export const PREVIEW_MAX_HEIGHT = 480;

export interface PreviewPlan {
  args: string[];
  durationMs: number;
  seamAtMs: number;
  files: PlanStep['files'];
}

/**
 * Renders "end of unit -> transition -> start of unit" exactly as it will appear at every seam
 * in the exported loop, at reduced resolution for speed.
 */
export function buildLoopPreviewPlan(project: ProjectDocument, outPath: string, tempDir: string): { ok: true; plan: PreviewPlan } | { ok: false; error: PlanError } {
  const unit = resolveLoopUnit(project);
  if (!unit.ok) return unit;
  const seq = unit.spec;
  const loop = project.settings.loop;
  const canvas = resolveCanvas(project, PREVIEW_MAX_HEIGHT);
  const fps = canvas.fps;
  const includeAudio = seq.hasAudio;
  const lm = computeLoopMath(seq.durationMs, { ...loop, targetDurationMs: Math.max(loop.targetDurationMs, seq.durationMs * 2) }, fps, includeAudio);
  if (!lm.ok) return { ok: false, error: `loop-${lm.error}` };
  const m = lm.math;
  const L = m.unitFrames;
  const O = m.overlapFrames;
  const ctx = Math.min(msToFrames(PREVIEW_CONTEXT_MS, fps), L - 2 * O > 0 ? L - 2 * O : L - O);
  const pre = Math.max(0, Math.min(ctx, L - O));
  const post = Math.max(0, Math.min(ctx, L - O));
  const fMs = (f: number): number => framesToMs(f, fps);

  // Range A: [L-O-pre, L)  Range B: [0, O+post)
  const gA = buildSequenceGraph(seq, canvas, { includeAudio, includeVideo: true, prefix: 'pa', inputOffset: 0, rangeStartMs: fMs(L - O - pre), rangeEndMs: fMs(L) });
  const gB = buildSequenceGraph(seq, canvas, { includeAudio, includeVideo: true, prefix: 'pb', inputOffset: gA.inputCount, rangeStartMs: 0, rangeEndMs: fMs(O + post) });
  const filters = [...gA.filters, ...gB.filters];
  const S = (f: number): number => framesToSamples(f, fps);
  const vTrim = (src: string, a: number, b: number, out: string): string => `${src}trim=start_frame=${a}:end_frame=${b},setpts=PTS-STARTPTS${out}`;
  const aTrim = (src: string, a: number, b: number, out: string): string => `${src}atrim=start_sample=${a}:end_sample=${b},asetpts=N/SR/TB${out}`;

  filters.push(`${gA.videoLabel}split=2[pva1][pvxa]`, `${gB.videoLabel}split=2[pvxb][pvb2]`);
  filters.push(vTrim('[pva1]', 0, pre, '[pa1]'), vTrim('[pvb2]', O, O + post, '[pb2]'));
  if (O > 0 && m.videoFrames > 0) {
    if (m.videoStartFrames === 0 && m.videoFrames === O) {
      filters.push(vTrim('[pvxa]', pre, pre + O, '[pxa]'), vTrim('[pvxb]', 0, O, '[pxb]'));
      filters.push(`[pxa][pxb]xfade=transition=${loop.videoTransition}:duration=${secArg(fMs(O))}:offset=0.0000[pxv]`);
    } else {
      filters.push(vTrim('[pvxa]', pre, pre + m.videoStartFrames + m.videoFrames, '[pxa]'), vTrim('[pvxb]', 0, O - m.videoStartFrames, '[pxb]'));
      filters.push(`[pxa][pxb]xfade=transition=${loop.videoTransition}:duration=${secArg(fMs(m.videoFrames))}:offset=${secArg(fMs(m.videoStartFrames))}[pxv]`);
    }
  } else {
    filters.push('[pvxa]nullsink', vTrim('[pvxb]', 0, O, '[pxv]'));
  }
  const vParts = ['[pa1]', '[pxv]', '[pb2]'];
  const maps: string[] = [];
  if (includeAudio && gA.audioLabel && gB.audioLabel) {
    filters.push(`${gA.audioLabel}asplit=2[paa1][paxa]`, `${gB.audioLabel}asplit=2[paxb][pab2]`);
    filters.push(aTrim('[paa1]', 0, S(pre), '[pA1]'), aTrim('[pab2]', S(O), S(O + post), '[pB2]'));
    if (O > 0 && m.audioSamples > 0) {
      const asSec = secArg((m.audioStartSamples / AUDIO_RATE) * 1000);
      const adSec = secArg((m.audioSamples / AUDIO_RATE) * 1000);
      const curve = loop.audioCurve;
      filters.push(
        aTrim('[paxa]', S(pre), S(pre + O), '[pAxa]'),
        `[pAxa]afade=t=out:st=${asSec}:d=${adSec}:curve=${curve}[pAf1]`,
        aTrim('[paxb]', 0, S(O), '[pAxb]'),
        `[pAxb]afade=t=in:st=${asSec}:d=${adSec}:curve=${curve}[pAf2]`,
        `[pAf1][pAf2]amix=inputs=2:weights=1 1:normalize=0:duration=first:dropout_transition=0,atrim=end_sample=${S(O)},asetpts=N/SR/TB[pAx]`
      );
    } else {
      filters.push('[paxa]anullsink', aTrim('[paxb]', 0, S(O), '[pAx]'));
    }
    filters.push(`[pa1][pA1][pxv][pAx][pb2][pB2]concat=n=3:v=1:a=1[pv][pa]`);
    maps.push('-map', '[pv]', '-map', '[pa]', '-c:a', 'aac', '-b:a', '128k', '-ar', String(AUDIO_RATE), '-ac', '2');
  } else {
    filters.push(`${vParts.join('')}concat=n=3:v=1:a=0[pv]`);
    maps.push('-map', '[pv]');
  }
  const files: PlanStep['files'] = [];
  const args = [
    ...COMMON,
    ...gA.inputArgs,
    ...gB.inputArgs,
    ...filterArgs(filters, tempDir, 'preview', files),
    ...maps,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26', '-pix_fmt', 'yuv420p', '-r', rationalToString(fps),
    '-movflags', '+faststart',
    outPath,
  ];
  if (commandLength(args) > MAX_COMMAND_CHARS) return { ok: false, error: 'command-too-long' };
  const totalFrames = pre + O + post;
  return { ok: true, plan: { args, durationMs: fMs(totalFrames), seamAtMs: fMs(pre + O / 2), files } };
}

export type { VideoTransition };
